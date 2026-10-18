
import { eq, and, sql } from "drizzle-orm";
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

import { lobbyRepository } from "../database/repositories/LobbyRepository";
import { matchRepository } from "../database/repositories/MatchRepository";
import { userRepository } from "../database/repositories/UserRepository";
import { seasonRepository } from "../database/repositories/SeasonRepository";
import { auditoriaRepository } from "../database/repositories/AuditoriaRepository";

import { transitionTo } from "./LobbyService";
import { eventBus } from "./EventBus";
import { startQuestionnaire } from "./QuestionnaireService";

import {
  calculateEloChanges,
  DEFAULT_ELO,
  type MatchResultado,
  type PlayerSlot,
} from "./EloService";

import { LobbyStatus, AuditModulo, EloMotivo } from "../database/enums";
import { logger } from "../lib/logger";
import { achievementService } from "./AchievementService";
import { achievementNotificationService } from "./AchievementNotificationService";

export type StaffDecision = "confirm" | "modify" | "cancel";

/**
 * Inicia una partida:
 * READY → IN_GAME.
 *
 * Primero crea la partida y registra a los participantes.
 * Después cambia el estado del lobby a IN_GAME.
 */
export async function startMatch(
  lobbyId: string,
  supervisorId: string,
  client: Client,
): Promise<Partida> {
  const lobby = await lobbyRepository.findById(lobbyId);

  if (!lobby) {
    throw new Error("Lobby no encontrado.");
  }

  if (lobby.status !== LobbyStatus.Ready) {
    throw new Error(
      `El lobby debe estar READY para iniciar la partida. Estado actual: ${lobby.status}`,
    );
  }

  if (lobby.supervisorId !== supervisorId) {
    throw new Error(
      "El supervisor indicado no coincide con el supervisor asignado al lobby.",
    );
  }

  // Obtener la temporada activa.
  const season = await seasonRepository.findActive();

  // Crear el registro principal de la partida.
  const partida = await matchRepository.create({
    lobbyId,
    temporadaId: season?.id ?? null,
    status: "in_progress",
    supervisorId,
  });

  // Obtener a los participantes registrados en el lobby.
  const lobbyParticipants =
    await lobbyRepository.listParticipants(lobbyId);

  // Registrar a cada participante y guardar su ELO inicial.
  for (const participant of lobbyParticipants) {
    const user = await userRepository.upsert({
      discordId: participant.discordId,
      username: participant.discordId,
    });

    await matchRepository.addParticipant({
      partidaId: partida.id,
      discordId: participant.discordId,
      equipo: 1,
      eloInicio: user?.elo ?? DEFAULT_ELO,
    });
  }

  // Registrar al supervisor como participante número 15.
  // Evitar duplicarlo si ya figura entre los participantes del lobby.
  const supervisorAlreadyIncluded = lobbyParticipants.some(
    (participant) => participant.discordId === supervisorId,
  );

  if (!supervisorAlreadyIncluded) {
    const supervisorUser = await userRepository.upsert({
      discordId: supervisorId,
      username: supervisorId,
    });

    await matchRepository.addParticipant({
      partidaId: partida.id,
      discordId: supervisorId,
      equipo: 1,
      eloInicio: supervisorUser?.elo ?? DEFAULT_ELO,
    });
  }

  // Cambiar el estado solo después de registrar a los participantes.
  await transitionTo(lobbyId, LobbyStatus.InGame);

  logger.info(
    {
      lobbyId,
      matchId: partida.id,
      participants:
        lobbyParticipants.length +
        (supervisorAlreadyIncluded ? 0 : 1),
      supervisorId,
    },
    "Match started — participants registered",
  );

  return partida;
}

/**
 * El supervisor informa el equipo ganador y los jugadores
 * que abandonaron la partida.
 *
 * IN_GAME → VALIDATING.
 */
export async function finalizeMatch(
  lobbyId: string,
  supervisorId: string,
  ganador: "TRIPULANTES" | "IMPOSTORES",
  leaverIds: string[],
  client: Client,
): Promise<void> {
  const lobby = await lobbyRepository.findById(lobbyId);

  if (!lobby) {
    throw new Error("Lobby no encontrado.");
  }

  if (lobby.supervisorId !== supervisorId) {
    throw new Error(
      "Solo el supervisor asignado puede finalizar esta partida.",
    );
  }

  if (lobby.status !== LobbyStatus.InGame) {
    throw new Error(
      `El lobby debe estar IN_GAME para finalizar. Estado actual: ${lobby.status}`,
    );
  }

  const partida = await matchRepository.findByLobbyId(lobbyId);

  if (!partida) {
    throw new Error("Partida no encontrada para este lobby.");
  }

  await transitionTo(lobbyId, LobbyStatus.Validating);

  const participants = await matchRepository.listParticipants(
    partida.id,
  );

  const participantIds = participants.map(
    (participant) => participant.discordId,
  );

  logger.info(
    {
      lobbyId,
      matchId: partida.id,
      ganador,
      leaverCount: leaverIds.length,
    },
    "Match finalized by supervisor — starting questionnaire",
  );

  // El cuestionario continúa de forma asíncrona.
  startQuestionnaire(
    partida.id,
    lobbyId,
    lobby.guildId!,
    supervisorId,
    ganador,
    participantIds,
    leaverIds,
    client,
  ).catch((err) => {
    logger.error(
      { err, matchId: partida.id },
      "Failed to start questionnaire",
    );
  });
}

/**
 * Punto de entrada invocado cuando termina el cuestionario.
 */
export async function finalizeMatchClose(
  lobbyId: string,
  matchId: string,
  ganador: "TRIPULANTES" | "IMPOSTORES",
  impostorIds: string[],
  leaverIds: string[],
  actorId: string,
): Promise<void> {
  const resultado: MatchResultado = ganador;

  await closeMatchAtomic(
    lobbyId,
    matchId,
    resultado,
    impostorIds,
    leaverIds,
    actorId,
  );

  // Evaluar logros sin bloquear el cierre de la partida.
  matchRepository
    .listParticipants(matchId)
    .then(async (participants) => {
      const nonLeavers = participants.filter(
        (participant) =>
          !leaverIds.includes(participant.discordId),
      );

      const newlyUnlocked = await achievementService
        .evaluateAndUnlockForPlayers(
          nonLeavers.map((participant) => participant.discordId),
        )
        .catch(() => []);

      if (newlyUnlocked.length > 0) {
        const clientRef = (
          globalThis as any
        ).__discordClient as Client | undefined;

        if (clientRef) {
          await achievementNotificationService
            .notifyPlayers(clientRef, newlyUnlocked)
            .catch(() => {});
        }
      }
    })
    .catch((err) => {
      logger.warn(
        { err },
        "Achievement evaluation failed after match close",
      );
    });
}

/**
 * Resolución manual por parte del staff.
 */
export async function staffResolveMatch(
  partidaId: string,
  decision: StaffDecision,
  resultado: MatchResultado,
  impostorIds: string[],
  actorId: string,
  notas?: string,
  client?: Client,
): Promise<void> {
  const partida = await matchRepository.findById(partidaId);

  if (!partida) {
    throw new Error("Partida no encontrada.");
  }

  if (!partida.requiresRevision) {
    throw new Error(
      "Esta partida no tiene la bandera requires_revision activa.",
    );
  }

  if (
    partida.status === "closed" ||
    partida.status === "cancelled"
  ) {
    throw new Error("Esta partida ya está cerrada.");
  }

  if (!partida.lobbyId) {
    throw new Error("La partida no tiene un lobbyId asociado.");
  }

  if (decision !== "cancel" && impostorIds.length > 0) {
    const participants = await matchRepository.listParticipants(
      partidaId,
    );

    const validIds = new Set(
      participants.map((participant) => participant.discordId),
    );

    const invalidIds = impostorIds.filter(
      (id) => !validIds.has(id),
    );

    if (invalidIds.length > 0) {
      throw new Error(
        `IDs no válidos: ${invalidIds.join(", ")}`,
      );
    }
  }

  await auditoriaRepository.log({
    modulo: AuditModulo.Matchmaking,
    accion: "staff_resolve_match",
    realizadoPor: actorId,
    usuarioAfectado: partidaId,
    detalles: {
      decision,
      resultado,
      impostorIds,
      notas,
    },
  });

  await closeMatchAtomic(
    partida.lobbyId,
    partidaId,
    resultado,
    impostorIds,
    [],
    actorId,
  );

  matchRepository
    .listParticipants(partidaId)
    .then(async (participants) => {
      const newlyUnlocked = await achievementService
        .evaluateAndUnlockForPlayers(
          participants.map((participant) => participant.discordId),
        )
        .catch(() => []);

      if (newlyUnlocked.length > 0 && client) {
        await achievementNotificationService
          .notifyPlayers(client, newlyUnlocked)
          .catch(() => {});
      }
    })
    .catch((err) => {
      logger.warn(
        { err },
        "Achievement evaluation failed after staff resolve",
      );
    });
}

/**
 * Cierre transaccional de la partida y el lobby.
 */
async function closeMatchAtomic(
  lobbyId: string,
  partidaId: string,
  resultado: MatchResultado,
  impostorIds: string[],
  leaverIds: string[],
  actorId: string,
): Promise<void> {
  const impostorSet = new Set(impostorIds);
  const leaverSet = new Set(leaverIds);

  const allParticipants =
    await matchRepository.listParticipants(partidaId);

  const season = await seasonRepository.findActive();

  // Los abandonos ya recibieron su penalización correspondiente.
  const teamParticipants = allParticipants.filter(
    (participant) => !leaverSet.has(participant.discordId),
  );

  const playerSlots: PlayerSlot[] = teamParticipants.map(
    (participant) => ({
      discordId: participant.discordId,
      rol: impostorSet.has(participant.discordId)
        ? "impostor"
        : "tripulante",
      eloInicio: participant.eloInicio ?? DEFAULT_ELO,
    }),
  );

  const eloChanges = calculateEloChanges(
    playerSlots,
    resultado,
  );

  const currentEloMap = new Map<string, number>();

  for (const participant of teamParticipants) {
    const user = await userRepository.findByDiscordId(
      participant.discordId,
    );

    currentEloMap.set(
      participant.discordId,
      user?.elo ?? DEFAULT_ELO,
    );
  }

  const finalMatchStatus =
    resultado === "CANCELADA" ? "cancelled" : "closed";

  const finalLobbyStatus =
    resultado === "CANCELADA" ? "cancelled" : "closed";

  await db.transaction(async (tx) => {
    for (const change of eloChanges) {
      const eloAnterior =
        currentEloMap.get(change.discordId) ?? DEFAULT_ELO;

      const eloNuevo = eloAnterior + change.delta;

      const isWinner =
        (resultado === "TRIPULANTES" &&
          change.rol === "tripulante") ||
        (resultado === "IMPOSTORES" &&
          change.rol === "impostor");

      const isLoser =
        resultado !== "EMPATE" &&
        resultado !== "CANCELADA" &&
        !isWinner;

      await tx
        .update(participantesPartidaTable)
        .set({
          rol: change.rol,
          equipo: change.rol === "impostor" ? 2 : 1,
          status: "finished",
        })
        .where(
          and(
            eq(
              participantesPartidaTable.partidaId,
              partidaId,
            ),
            eq(
              participantesPartidaTable.discordId,
              change.discordId,
            ),
          ),
        );

      if (
        resultado !== "EMPATE" &&
        resultado !== "CANCELADA"
      ) {
        await tx.insert(historialEloTable).values({
          discordId: change.discordId,
          partidaId,
          temporadaId: season?.id ?? null,
          eloAnterior,
          eloNuevo,
          motivo: isWinner
            ? EloMotivo.Victory
            : EloMotivo.Defeat,
        });
      }

      if (resultado !== "CANCELADA") {
        await tx
          .update(usuariosTable)
          .set({
            elo: eloNuevo,
            updatedAt: sql`now()`,
          })
          .where(
            eq(
              usuariosTable.discordId,
              change.discordId,
            ),
          );
      }

      if (season && resultado !== "CANCELADA") {
        await tx
          .insert(estadisticasTemporadaTable)
          .values({
            discordId: change.discordId,
            temporadaId: season.id,
            partidasJugadas: 1,
            victorias: isWinner ? 1 : 0,
            derrotas: isLoser ? 1 : 0,
            abandonos: 0,
            elo: eloNuevo,
            mvpCount: 0,
          })
          .onConflictDoUpdate({
            target: [
              estadisticasTemporadaTable.discordId,
              estadisticasTemporadaTable.temporadaId,
            ],
            set: {
              partidasJugadas: sql`estadisticas_temporada.partidas_jugadas + 1`,
              victorias: sql`estadisticas_temporada.victorias + ${isWinner ? 1 : 0}`,
              derrotas: sql`estadisticas_temporada.derrotas + ${isLoser ? 1 : 0}`,
              elo: eloNuevo,
            },
          });
      }
    }

    // Cerrar la partida.
    await tx
      .update(partidasTable)
      .set({
        status: finalMatchStatus,
        finishedAt: sql`now()`,
      })
      .where(eq(partidasTable.id, partidaId));

    // Cerrar el lobby.
    await tx
      .update(lobbysTable)
      .set({
        status: finalLobbyStatus,
        updatedAt: sql`now()`,
      })
      .where(eq(lobbysTable.id, lobbyId));
  });

  logger.info(
    {
      lobbyId,
      partidaId,
      resultado,
      teamPlayers: eloChanges.length,
      leavers: leaverIds.length,
    },
    "Match closed atomically",
  );

  await auditoriaRepository.log({
    modulo: AuditModulo.Matchmaking,
    accion:
      resultado === "CANCELADA"
        ? "match_cancelada"
        : "match_closed",
    realizadoPor: actorId,
    detalles: {
      lobbyId,
      partidaId,
      resultado,
      eloChanges: eloChanges.map((change) => ({
        discordId: change.discordId,
        rol: change.rol,
        delta: change.delta,
      })),
      leaverIds,
    },
  });

  eventBus.emit("match:finished", {
    lobbyId,
    matchId: partidaId,
  });
}
