// ---------------------------------------------------------------------------
// MatchService — Match lifecycle for the new ranked workflow.
//
// Responsibilities:
//   • startMatch()         — READY → IN_GAME: create `partidas` + `participantes_partida`
//                            including the supervisor as participant #15.
//   • finalizeMatch()      — supervisor reports winner + leavers; transitions
//                            IN_GAME → VALIDATING and triggers the questionnaire.
//   • finalizeMatchClose() — exported entry point called by QuestionnaireService
//                            once questionnaires are done; delegates to the atomic
//                            transaction below.
//   • staffResolveMatch()  — crash-recovery path for requires_revision matches.
//   • closeMatchAtomic()   — VALIDATING → CLOSED inside a single PostgreSQL
//                            transaction: update roles, insert historial_elo,
//                            update usuarios.elo, upsert estadisticas_temporada,
//                            close partida + lobby.
//
// Architecture rules:
//   • ELO math lives in EloService — never here.
//   • Leaver ELO is applied by QuestionnaireService before this is called;
//     leavers are excluded from team ELO calculation here.
// ---------------------------------------------------------------------------

import { eq, and, sql, inArray } from "drizzle-orm";
import type { Client } from "discord.js";

import { db } from "../database/database";
import {
  partidasTable,
  participantesPartidaTable,
  historialEloTable,
  estadisticasTemporadaTable,
  usuariosTable,
  lobbysTable,
  type Partida,
} from "@workspace/db";

import { lobbyRepository }     from "../database/repositories/LobbyRepository";
import { matchRepository }     from "../database/repositories/MatchRepository";
import { userRepository }      from "../database/repositories/UserRepository";
import { seasonRepository }    from "../database/repositories/SeasonRepository";
import { auditoriaRepository } from "../database/repositories/AuditoriaRepository";

import { transitionTo }    from "./LobbyService";
import { eventBus }        from "./EventBus";
import { startQuestionnaire } from "./QuestionnaireService";
import {
  calculateEloChanges, DEFAULT_ELO,
  type MatchResultado, type PlayerSlot,
} from "./EloService";
import { LobbyStatus, AuditModulo, EloMotivo } from "../database/enums";
import { logger } from "../lib/logger";
import { achievementService }             from "./AchievementService";
import { achievementNotificationService } from "./AchievementNotificationService";

// ── Types ──────────────────────────────────────────────────────────────────

export type StaffDecision = "confirm" | "modify" | "cancel";

// ── Match Creation (READY → IN_GAME) ──────────────────────────────────────

/**
 * Transition lobby READY → IN_GAME, create the `partidas` record, and
 * snapshot each participant's current ELO into `participantes_partida`.
 * The supervisor is added as participant #15.
 */
export async function startMatch(
  lobbyId:      string,
  supervisorId: string,
  client:       Client,
): Promise<Partida> {
  await transitionTo(lobbyId, LobbyStatus.InGame);

  const season  = await seasonRepository.findActive();
  const partida = await matchRepository.create({
    lobbyId,
    temporadaId: season?.id ?? null,
    status:      "in_progress",
    supervisorId,
  });

  const lobbyParticipants = await lobbyRepository.listParticipants(lobbyId);

  for (const lp of lobbyParticipants) {
    const user      = await userRepository.upsert({ discordId: lp.discordId, username: lp.discordId });
    const eloInicio = user?.elo ?? DEFAULT_ELO;
    await matchRepository.addParticipant({
      partidaId: partida.id,
      discordId: lp.discordId,
      equipo:    1,
      eloInicio,
    });
  }

  // Add supervisor as participant #15
  const supervisorUser = await userRepository.upsert({ discordId: supervisorId, username: supervisorId });
  await matchRepository.addParticipant({
    partidaId: partida.id,
    discordId: supervisorId,
    equipo:    1,
    eloInicio: supervisorUser?.elo ?? DEFAULT_ELO,
  });

  logger.info(
    { lobbyId, matchId: partida.id, participants: lobbyParticipants.length + 1, supervisorId },
    "Match started — partidas record + ELO snapshots created (supervisor included)",
  );

  return partida;
}

// ── Match Finalization (supervisor /finalizar partida) ─────────────────────

/**
 * Supervisor reports the winner + any pre-identified leavers.
 * Transitions IN_GAME → VALIDATING and kicks off the DM questionnaire.
 * Results are not published until the questionnaire resolves.
 */
export async function finalizeMatch(
  lobbyId:      string,
  supervisorId: string,
  ganador:      "TRIPULANTES" | "IMPOSTORES",
  leaverIds:    string[],
  client:       Client,
): Promise<void> {
  const lobby = await lobbyRepository.findById(lobbyId);
  if (!lobby) throw new Error("Lobby no encontrado.");
  if (lobby.supervisorId !== supervisorId) {
    throw new Error("Solo el supervisor asignado puede finalizar esta partida.");
  }
  if (lobby.status !== LobbyStatus.InGame) {
    throw new Error(`El lobby debe estar IN_GAME para finalizar. Estado actual: ${lobby.status}`);
  }

  const partida = await matchRepository.findByLobbyId(lobbyId);
  if (!partida) throw new Error("Partida no encontrada para este lobby.");

  // Transition to VALIDATING (waiting for questionnaire)
  await transitionTo(lobbyId, LobbyStatus.Validating);

  // Gather all participants for the questionnaire
  const participants   = await matchRepository.listParticipants(partida.id);
  const participantIds = participants.map((p) => p.discordId);

  logger.info(
    { lobbyId, matchId: partida.id, ganador, leaverCount: leaverIds.length },
    "Match finalized by supervisor — starting questionnaire",
  );

  // Start questionnaire (non-blocking: questionnaire finalization posts results)
  startQuestionnaire(
    partida.id,
    lobbyId,
    lobby.guildId!,
    supervisorId,
    ganador,
    participantIds,
    leaverIds,
    client,
  ).catch((err) =>
    logger.error({ err, matchId: partida.id }, "Failed to start questionnaire"),
  );
}

// ── Match Close Entry Point (called by QuestionnaireService) ───────────────

/**
 * Called by QuestionnaireService once questionnaires are done.
 * Delegates straight to the atomic transaction.
 */
export async function finalizeMatchClose(
  lobbyId:     string,
  matchId:     string,
  ganador:     "TRIPULANTES" | "IMPOSTORES",
  impostorIds: string[],
  leaverIds:   string[],
  actorId:     string,
): Promise<void> {
  const resultado: MatchResultado = ganador;
  await closeMatchAtomic(lobbyId, matchId, resultado, impostorIds, leaverIds, actorId);

  // Fire achievement evaluation for all participants (non-blocking)
  (() => {
    matchRepository.listParticipants(matchId).then(async (participants) => {
      const nonLeavers = participants.filter(
        (p) => !leaverIds.includes(p.discordId),
      );
      const newlyUnlocked = await achievementService
        .evaluateAndUnlockForPlayers(nonLeavers.map((p) => p.discordId))
        .catch(() => []);

      if (newlyUnlocked.length > 0) {
        const clientRef = (globalThis as any).__discordClient as Client | undefined;
        if (clientRef) {
          await achievementNotificationService
            .notifyPlayers(clientRef, newlyUnlocked)
            .catch(() => {});
        }
      }
    }).catch((err) => logger.warn({ err }, "Achievement evaluation failed after match close"));
  })();
}

// ── Staff Resolution (requires_revision crash-recovery path) ──────────────

export async function staffResolveMatch(
  partidaId:   string,
  decision:    StaffDecision,
  resultado:   MatchResultado,
  impostorIds: string[],
  actorId:     string,
  notas?:      string,
  client?:     Client,
): Promise<void> {
  const partida = await matchRepository.findById(partidaId);
  if (!partida) throw new Error("Partida no encontrada.");
  if (!partida.requiresRevision) {
    throw new Error("Esta partida no tiene la bandera requires_revision activa.");
  }
  if (partida.status === "closed" || partida.status === "cancelled") {
    throw new Error("Esta partida ya está cerrada.");
  }
  if (!partida.lobbyId) throw new Error("La partida no tiene un lobbyId asociado.");

  if (decision !== "cancel" && impostorIds.length > 0) {
    const participants = await matchRepository.listParticipants(partidaId);
    const validIds     = new Set(participants.map((p) => p.discordId));
    const invalidIds   = impostorIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      throw new Error(`IDs no válidos: ${invalidIds.join(", ")}`);
    }
  }

  await auditoriaRepository.log({
    modulo:          AuditModulo.Matchmaking,
    accion:          "staff_resolve_match",
    realizadoPor:    actorId,
    usuarioAfectado: partidaId,
    detalles:        { decision, resultado, impostorIds, notas },
  });

  await closeMatchAtomic(partida.lobbyId, partidaId, resultado, impostorIds, [], actorId);

  (() => {
    matchRepository.listParticipants(partidaId).then(async (participants) => {
      const newlyUnlocked = await achievementService
        .evaluateAndUnlockForPlayers(participants.map((p) => p.discordId))
        .catch(() => []);
      if (newlyUnlocked.length > 0 && client) {
        await achievementNotificationService.notifyPlayers(client, newlyUnlocked).catch(() => {});
      }
    }).catch((err) => logger.warn({ err }, "Achievement evaluation failed after staff resolve"));
  })();
}

// ── Atomic transaction (VALIDATING → CLOSED) ──────────────────────────────

async function closeMatchAtomic(
  lobbyId:     string,
  partidaId:   string,
  resultado:   MatchResultado,
  impostorIds: string[],
  leaverIds:   string[],
  actorId:     string,
): Promise<void> {
  const impostorSet  = new Set(impostorIds);
  const leaverSet    = new Set(leaverIds);
  const allParticipants = await matchRepository.listParticipants(partidaId);
  const season       = await seasonRepository.findActive();

  // Exclude leavers from team ELO calculation (they were already penalised)
  const teamParticipants = allParticipants.filter((p) => !leaverSet.has(p.discordId));

  const playerSlots: PlayerSlot[] = teamParticipants.map((p) => ({
    discordId: p.discordId,
    rol:       impostorSet.has(p.discordId) ? "impostor" : "tripulante",
    eloInicio: p.eloInicio ?? DEFAULT_ELO,
  }));

  const eloChanges = calculateEloChanges(playerSlots, resultado);

  const currentEloMap = new Map<string, number>();
  for (const p of teamParticipants) {
    const user = await userRepository.findByDiscordId(p.discordId);
    currentEloMap.set(p.discordId, user?.elo ?? DEFAULT_ELO);
  }

  const finalMatchStatus = resultado === "CANCELADA" ? "cancelled" : "closed";
  const finalLobbyStatus = resultado === "CANCELADA" ? "cancelled" : "closed";

  await db.transaction(async (tx) => {
    // Process team participants
    for (const change of eloChanges) {
      const eloAnterior = currentEloMap.get(change.discordId) ?? DEFAULT_ELO;
      const eloNuevo    = eloAnterior + change.delta;

      const isWinner =
        (resultado === "TRIPULANTES" && change.rol === "tripulante") ||
        (resultado === "IMPOSTORES"  && change.rol === "impostor");
      const isLoser = resultado !== "EMPATE" && resultado !== "CANCELADA" && !isWinner;

      await tx
        .update(participantesPartidaTable)
        .set({
          rol:    change.rol,
          equipo: change.rol === "impostor" ? 2 : 1,
          status: "finished",
        })
        .where(
          and(
            eq(participantesPartidaTable.partidaId, partidaId),
            eq(participantesPartidaTable.discordId, change.discordId),
          ),
        );

      if (resultado !== "EMPATE" && resultado !== "CANCELADA") {
        await tx.insert(historialEloTable).values({
          discordId:   change.discordId,
          partidaId,
          temporadaId: season?.id ?? null,
          eloAnterior,
          eloNuevo,
          motivo:      isWinner ? EloMotivo.Victory : EloMotivo.Defeat,
        });
      }

      if (resultado !== "CANCELADA") {
        await tx
          .update(usuariosTable)
          .set({ elo: eloNuevo, updatedAt: sql`now()` })
          .where(eq(usuariosTable.discordId, change.discordId));
      }

      if (season && resultado !== "CANCELADA") {
        await tx
          .insert(estadisticasTemporadaTable)
          .values({
            discordId:       change.discordId,
            temporadaId:     season.id,
            partidasJugadas: 1,
            victorias:       isWinner ? 1 : 0,
            derrotas:        isLoser  ? 1 : 0,
            abandonos:       0,
            elo:             eloNuevo,
            mvpCount:        0,
          })
          .onConflictDoUpdate({
            target: [
              estadisticasTemporadaTable.discordId,
              estadisticasTemporadaTable.temporadaId,
            ],
            set: {
              partidasJugadas: sql`estadisticas_temporada.partidas_jugadas + 1`,
              victorias:       sql`estadisticas_temporada.victorias + ${isWinner ? 1 : 0}`,
              derrotas:        sql`estadisticas_temporada.derrotas  + ${isLoser  ? 1 : 0}`,
              elo:             eloNuevo,
            },
          });
      }
    }

    // Close partida
    await tx
      .update(partidasTable)
      .set({ status: finalMatchStatus, finishedAt: sql`now()` })
      .where(eq(partidasTable.id, partidaId));

    // Close lobby
    await tx
      .update(lobbysTable)
      .set({ status: finalLobbyStatus, updatedAt: sql`now()` })
      .where(eq(lobbysTable.id, lobbyId));
  });

  logger.info(
    { lobbyId, partidaId, resultado, teamPlayers: eloChanges.length, leavers: leaverIds.length },
    "Match closed atomically",
  );

  await auditoriaRepository.log({
    modulo:       AuditModulo.Matchmaking,
    accion:       resultado === "CANCELADA" ? "match_cancelada" : "match_closed",
    realizadoPor: actorId,
    detalles: {
      lobbyId, partidaId, resultado,
      eloChanges: eloChanges.map((c) => ({ discordId: c.discordId, rol: c.rol, delta: c.delta })),
      leaverIds,
    },
  });

  eventBus.emit("match:finished", { lobbyId, matchId: partidaId });
}
