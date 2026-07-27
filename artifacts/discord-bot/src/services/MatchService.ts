// ---------------------------------------------------------------------------
// MatchService — Match lifecycle for Phase 3.
//
// Responsibilities:
//   • startMatch()   — READY → IN_GAME: create `partidas` + `participantes_partida`
//                       with ELO snapshot.
//   • submitResult() — supervisor reports result; transitions IN_GAME → VALIDATING,
//                       then triggers atomic closure unless `requires_revision` is set.
//   • closeMatchAtomic() — VALIDATING → CLOSED inside a single PostgreSQL transaction:
//                           update roles, insert historial_elo, update usuarios.elo,
//                           upsert estadisticas_temporada, close partida + lobby.
//
// Strict architecture rules:
//   • ELO math lives in EloService — never here.
//   • DB persistence for non-transactional ops lives in repositories.
//   • This service owns the atomic transaction block; it uses tx directly to
//     ensure all mutations share a single connection and commit atomically.
// ---------------------------------------------------------------------------

import { eq, and, sql } from "drizzle-orm";
import type { Client }   from "discord.js";
import { EmbedBuilder }  from "discord.js";

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
import { reportRepository }    from "../database/repositories/ReportRepository";

import { transitionTo }      from "./LobbyService";
import { eventBus }          from "./EventBus";
import { calculateEloChanges, DEFAULT_ELO, type MatchResultado, type PlayerSlot } from "./EloService";
import { LobbyStatus, AuditModulo, EloMotivo } from "../database/enums";
import { logger } from "../lib/logger";
import { achievementService } from "./AchievementService";
import { achievementNotificationService } from "./AchievementNotificationService";

// ── Staff Resolution (requires_revision → CLOSED / CANCELLED) ─────────────

export type StaffDecision = "confirm" | "modify" | "cancel";

/**
 * Staff resolution path for matches held with requires_revision = true.
 *
 * Decisions:
 *   confirm — approve the supervisor's original result; execute closeMatchAtomic.
 *   modify  — apply a corrected resultado/impostors; execute closeMatchAtomic.
 *   cancel  — close as CANCELADA; no ELO or season-stats changes.
 *
 * Validation runs before any state mutation:
 *   • Partida must exist, have requiresRevision=true, and not be closed.
 *   • Partida must have an associated lobbyId.
 *   • For confirm/modify, impostorIds (if provided) are verified against participantes_partida.
 *   • For IMPOSTORES/TRIPULANTES outcomes, at least one impostor is required.
 *
 * A complete audit entry is written before closeMatchAtomic is invoked.
 */
export async function staffResolveMatch(
  partidaId:   string,
  decision:    StaffDecision,
  resultado:   MatchResultado,
  impostorIds: string[],
  actorId:     string,
  notas?:      string,
  client?:     Client,
): Promise<void> {
  // 1. Load and validate partida
  const partida = await matchRepository.findById(partidaId);
  if (!partida) throw new Error("Partida no encontrada.");
  if (!partida.requiresRevision) {
    throw new Error("Esta partida no tiene la bandera requires_revision activa.");
  }
  if (partida.status === "closed" || partida.status === "cancelled") {
    throw new Error("Esta partida ya está cerrada y no puede ser modificada.");
  }
  if (!partida.lobbyId) {
    throw new Error("Esta partida no tiene lobby asociado — no se puede cerrar automáticamente.");
  }

  // 2. For non-cancel decisions: validate impostorIds against participantes_partida
  if (decision !== "cancel" && impostorIds.length > 0) {
    const participants = await matchRepository.listParticipants(partidaId);
    const validIds     = new Set(participants.map((p) => p.discordId));
    const invalidIds   = impostorIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      throw new Error(
        `Los siguientes IDs no pertenecen a esta partida: ${invalidIds.join(", ")}`,
      );
    }
  }

  // 3. For competitive outcomes: require at least one impostor
  if (
    decision !== "cancel" &&
    (resultado === "IMPOSTORES" || resultado === "TRIPULANTES") &&
    impostorIds.length === 0
  ) {
    throw new Error(
      "Debes especificar al menos un impostor para resultados IMPOSTORES o TRIPULANTES.",
    );
  }

  // 4. Mandatory audit entry BEFORE any mutation
  await auditoriaRepository.log({
    modulo:       AuditModulo.Matchmaking,
    accion:       `staff_resolve_${decision}`,
    realizadoPor: actorId,
    detalles:     {
      partidaId,
      lobbyId:        partida.lobbyId,
      decision,
      resultado,
      impostorIds,
      notas:          notas ?? null,
      previousStatus: partida.status,
    },
  });

  // 5. Execute atomic closure (bypasses submitResult state-machine;
  //    directly applies ELO, stats, and closes both partida + lobby rows)
  await closeMatchAtomic(partida.lobbyId, partidaId, resultado, impostorIds, actorId);

  logger.info(
    { partidaId, lobbyId: partida.lobbyId, decision, resultado },
    "Staff resolved requires_revision match",
  );

  // 6. Fire-and-forget achievement evaluation + notification — isolated from
  //    match closure. Any failure is caught and logged; it never reverts the
  //    ELO or stat changes committed above.
  void (async () => {
    try {
      const participants  = await matchRepository.listParticipants(partidaId);
      const discordIds    = participants.map((p) => p.discordId);
      const newlyUnlocked = await achievementService.evaluateAndUnlockForPlayers(discordIds);
      if (client && newlyUnlocked.length > 0) {
        await achievementNotificationService.notifyPlayers(client, newlyUnlocked);
      }
    } catch (err) {
      logger.warn({ err, partidaId }, "Achievement evaluation failed after staff resolve — continuing");
    }
  })();
}

// ── Match Creation (READY → IN_GAME) ──────────────────────────────────────

/**
 * Transition lobby READY → IN_GAME, create the `partidas` record, and
 * snapshot each participant's current ELO into `participantes_partida`.
 *
 * Call this from the `/supervisor start` command handler.
 */
export async function startMatch(
  lobbyId: string,
  client:  Client,
): Promise<Partida> {
  // 1. Validate + transition to IN_GAME
  await transitionTo(lobbyId, LobbyStatus.InGame);

  // 2. Find active season (optional — null if none configured)
  const season = await seasonRepository.findActive();

  // 3. Create partidas record
  const partida = await matchRepository.create({
    lobbyId,
    temporadaId: season?.id ?? null,
    status:      "in_progress",
  });

  // 4. Fetch lobby participants and snapshot their ELO
  const lobbyParticipants = await lobbyRepository.listParticipants(lobbyId);

  for (const lp of lobbyParticipants) {
    const user      = await userRepository.findByDiscordId(lp.discordId);
    const eloInicio = user?.elo ?? DEFAULT_ELO;

    await matchRepository.addParticipant({
      partidaId: partida.id,
      discordId: lp.discordId,
      equipo:    1,          // placeholder; updated at result time (1=tripulantes, 2=impostores)
      eloInicio,             // historical snapshot for reproducible ELO calculation
    });
  }

  logger.info(
    { lobbyId, matchId: partida.id, participants: lobbyParticipants.length, seasonId: season?.id },
    "Match started — partidas record + ELO snapshots created",
  );

  // 5. Audit log
  await auditoriaRepository.log({
    modulo:         AuditModulo.Matchmaking,
    accion:         "match_started",
    realizadoPor:   "system",
    detalles:       { lobbyId, matchId: partida.id, participants: lobbyParticipants.length },
  });

  // 6. Notify text channel
  const lobby = await lobbyRepository.findById(lobbyId);
  if (lobby?.textChannelId && lobby.guildId) {
    try {
      const guild = await client.guilds.fetch(lobby.guildId);
      const ch    = guild.channels.cache.get(lobby.textChannelId);
      if (ch?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor("Orange")
          .setTitle("⚔️ ¡Partida iniciada!")
          .setDescription("El supervisor ha iniciado la partida. ¡Buena suerte a todos!")
          .addFields(
            { name: "Match ID", value: partida.id.slice(0, 8), inline: true },
            { name: "Jugadores", value: String(lobbyParticipants.length), inline: true },
          )
          .setTimestamp();
        await (ch as any).send({ embeds: [embed] });
      }
    } catch (err) {
      logger.warn({ err }, "Could not notify text channel on match start — continuing");
    }
  }

  eventBus.emit("match:started", { lobbyId, matchId: partida.id });
  return partida;
}

// ── Result Reporting ───────────────────────────────────────────────────────

export interface SubmitResultOutput {
  /** True if the match was atomically closed in this call. */
  closed:          boolean;
  /** True if the match is held in VALIDATING for staff review. */
  requiresRevision: boolean;
  matchId:          string;
}

/**
 * Supervisor reports the match result.
 *
 * Flow:
 *   IN_GAME → VALIDATING (always on this call)
 *   VALIDATING → CLOSED  (only when requiresRevision = false)
 *
 * @param lobbyId      - Active lobby UUID
 * @param resultado    - IMPOSTORES | TRIPULANTES | EMPATE | CANCELADA
 * @param impostorIds  - Discord IDs of impostor players (required for IMPOSTORES/TRIPULANTES)
 * @param actorId      - Discord ID of the supervisor submitting the result
 * @param notas        - Optional supervisor notes (creates a RESULTADO report if provided)
 */
export async function submitResult(
  lobbyId:     string,
  resultado:   MatchResultado,
  impostorIds: string[],
  actorId:     string,
  notas?:      string,
  client?:     Client,
): Promise<SubmitResultOutput> {
  // 1. Find the associated partida
  const partida = await matchRepository.findByLobbyId(lobbyId);
  if (!partida) throw new Error("No se encontró una partida activa para este lobby.");

  // 2. Idempotency guard
  if (partida.status === "closed" || partida.status === "cancelled") {
    throw new Error("Esta partida ya está cerrada. No se puede reportar el resultado de nuevo.");
  }

  // 3. Validate impostorIds against actual match participants (before any state change)
  if (impostorIds.length > 0) {
    const participants = await matchRepository.listParticipants(partida.id);
    const validIds = new Set(participants.map((p) => p.discordId));
    const invalidIds = impostorIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      throw new Error(
        `Los siguientes IDs no pertenecen a esta partida y no pueden ser asignados como impostores: ${invalidIds.join(", ")}`,
      );
    }
  }

  // 4. Transition lobby IN_GAME → VALIDATING
  await transitionTo(lobbyId, LobbyStatus.Validating);

  // 5. Optional: create a resultado report if notas were supplied
  if (notas) {
    try {
      await reportRepository.create({
        reportanteId: actorId,
        reportadoId:  actorId,   // self-reference for result reports
        partidaId:    partida.id,
        motivo:       "RESULTADO",
        descripcion:  notas,
        status:       "resolved",
        resueltoFor:  actorId,
      });
    } catch (err) {
      logger.warn({ err }, "Could not create RESULTADO report — continuing");
    }
  }

  // 6. requires_revision check — keep in VALIDATING for staff if flagged
  if (partida.requiresRevision) {
    logger.warn({ lobbyId, matchId: partida.id }, "Match requires_revision=true — holding in VALIDATING");
    await auditoriaRepository.log({
      modulo:         AuditModulo.Matchmaking,
      accion:         "match_held_for_revision",
      realizadoPor:   actorId,
      detalles:       { lobbyId, matchId: partida.id, resultado },
    });
    return { closed: false, requiresRevision: true, matchId: partida.id };
  }

  // 6. Auto-close atomically
  await closeMatchAtomic(lobbyId, partida.id, resultado, impostorIds, actorId);

  // 7. Fire-and-forget achievement evaluation + notification — isolated from
  //    match closure. Any failure is caught and logged; it never reverts the
  //    ELO or stat changes committed above.
  void (async () => {
    try {
      const participants  = await matchRepository.listParticipants(partida.id);
      const discordIds    = participants.map((p) => p.discordId);
      const newlyUnlocked = await achievementService.evaluateAndUnlockForPlayers(discordIds);
      if (client && newlyUnlocked.length > 0) {
        await achievementNotificationService.notifyPlayers(client, newlyUnlocked);
      }
    } catch (err) {
      logger.warn({ err, matchId: partida.id }, "Achievement evaluation failed after match close — continuing");
    }
  })();

  return { closed: true, requiresRevision: false, matchId: partida.id };
}

// ── Atomic Closure (VALIDATING → CLOSED) ──────────────────────────────────

/**
 * Atomically close a match inside a single PostgreSQL transaction:
 *   1. Assign roles to participantes_partida (impostor / tripulante)
 *   2. Calculate ELO deltas using elo_inicio snapshots
 *   3. Insert historial_elo entries
 *   4. Update usuarios.elo
 *   5. Upsert estadisticas_temporada
 *   6. Mark partida as closed / cancelled
 *   7. Mark lobby as closed / cancelled
 *
 * On any error the transaction rolls back automatically (Drizzle throws).
 */
async function closeMatchAtomic(
  lobbyId:     string,
  partidaId:   string,
  resultado:   MatchResultado,
  impostorIds: string[],
  actorId:     string,
): Promise<void> {
  const impostorSet   = new Set(impostorIds);
  const participants  = await matchRepository.listParticipants(partidaId);
  const season        = await seasonRepository.findActive();

  // Resolve each participant's role slot
  const playerSlots: PlayerSlot[] = participants.map((p) => ({
    discordId: p.discordId,
    rol:       impostorSet.has(p.discordId) ? "impostor" : "tripulante",
    eloInicio: p.eloInicio ?? DEFAULT_ELO,
  }));

  // ELO calculation (pure math — uses eloInicio snapshots)
  const eloChanges = calculateEloChanges(playerSlots, resultado);

  // Snapshot current ELOs (elo_anterior for historial_elo)
  const currentEloMap = new Map<string, number>();
  for (const p of participants) {
    const user = await userRepository.findByDiscordId(p.discordId);
    currentEloMap.set(p.discordId, user?.elo ?? DEFAULT_ELO);
  }

  // Determine final match / lobby statuses
  const finalMatchStatus: string = resultado === "CANCELADA" ? "cancelled" : "closed";
  const finalLobbyStatus: string = resultado === "CANCELADA" ? "cancelled" : "closed";

  // ── Atomic transaction ──────────────────────────────────────────────────
  await db.transaction(async (tx) => {
    for (const change of eloChanges) {
      const eloAnterior = currentEloMap.get(change.discordId) ?? DEFAULT_ELO;
      const eloNuevo    = eloAnterior + change.delta;

      const isWinner =
        (resultado === "TRIPULANTES" && change.rol === "tripulante") ||
        (resultado === "IMPOSTORES"  && change.rol === "impostor");
      const isLoser = resultado !== "EMPATE" && resultado !== "CANCELADA" && !isWinner;

      // 1. Update participant role + equipo + status
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

      // 2. Insert historial_elo (skip for EMPATE and CANCELADA — delta = 0, no stat change)
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

      // 3. Update usuarios.elo (skip for CANCELADA — no ELO change)
      if (resultado !== "CANCELADA") {
        await tx
          .update(usuariosTable)
          .set({ elo: eloNuevo, updatedAt: sql`now()` })
          .where(eq(usuariosTable.discordId, change.discordId));
      }

      // 4. Upsert estadisticas_temporada (skip for CANCELADA)
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

    // 5. Close partida
    await tx
      .update(partidasTable)
      .set({ status: finalMatchStatus, finishedAt: sql`now()` })
      .where(eq(partidasTable.id, partidaId));

    // 6. Close lobby
    await tx
      .update(lobbysTable)
      .set({ status: finalLobbyStatus, updatedAt: sql`now()` })
      .where(eq(lobbysTable.id, lobbyId));
  });
  // ── End transaction ─────────────────────────────────────────────────────

  logger.info(
    { lobbyId, partidaId, resultado, playerCount: eloChanges.length },
    "Match closed atomically",
  );

  // Audit log (outside transaction — informational, not critical)
  await auditoriaRepository.log({
    modulo:       AuditModulo.Matchmaking,
    accion:       resultado === "CANCELADA" ? "match_cancelada" : "match_closed",
    realizadoPor: actorId,
    detalles:     {
      lobbyId,
      partidaId,
      resultado,
      eloChanges: eloChanges.map((c) => ({
        discordId: c.discordId,
        rol:       c.rol,
        delta:     c.delta,
      })),
    },
  });

  eventBus.emit("match:finished", { lobbyId, matchId: partidaId });
}
