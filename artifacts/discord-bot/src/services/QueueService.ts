// ---------------------------------------------------------------------------
// QueueService — join/leave queue, integrity, queue-full detection.
// Derived user state lives here (computed from DB — never stored redundantly).
// ---------------------------------------------------------------------------

import { Client, Guild } from "discord.js";
import { lobbyRepository } from "../database/repositories/LobbyRepository";
import { LobbyStatus, CompetitiveState } from "../database/enums";
import { ConfigKey } from "../database/enums";
import { getConfigInt } from "./ConfigService";
import {
  getUserCompetitiveState, getOrCreateQueueLobby, transitionTo,
} from "./LobbyService";
import { assignNextSupervisor } from "./SupervisorService";
import { eventBus } from "./EventBus";
import { logger } from "../lib/logger";

/** Add a player to the queue. Returns the updated participant count. */
export async function joinQueue(
  discordId: string,
  guildId: string,
  client: Client,
): Promise<{ joined: boolean; reason?: string; count: number; max: number }> {
  // Derive current state — reject if not libre
  const state = await getUserCompetitiveState(discordId);
  if (state !== CompetitiveState.Libre) {
    return {
      joined: false,
      reason: stateMessage(state),
      count:  0,
      max:    0,
    };
  }

  const maxJugadores = await getConfigInt(ConfigKey.MaxPlayers, 10);
  const lobby = await getOrCreateQueueLobby(guildId, discordId);

  // Guard: lobby might have filled between calls
  if (lobby.status !== LobbyStatus.Queue) {
    return { joined: false, reason: "La cola se está procesando. Inténtalo de nuevo en un momento.", count: 0, max: maxJugadores };
  }

  try {
    await lobbyRepository.addParticipant({ lobbyId: lobby.id, discordId });
  } catch (err: any) {
    // Unique constraint → already in this lobby
    if (err?.code === "23505") {
      return { joined: false, reason: "Ya estás en la cola.", count: await lobbyRepository.countParticipants(lobby.id), max: maxJugadores };
    }
    throw err;
  }

  const count = await lobbyRepository.countParticipants(lobby.id);
  logger.info({ discordId, lobbyId: lobby.id, count, maxJugadores }, "Player joined queue");
  eventBus.emit("player:joined_queue", { discordId, lobbyId: lobby.id });

  // Check if full
  if (count >= maxJugadores) {
    await onQueueFull(lobby.id, guildId, client);
  }

  return { joined: true, count, max: maxJugadores };
}

/** Remove a player from the queue. */
export async function leaveQueue(
  discordId: string,
): Promise<{ left: boolean; reason?: string }> {
  const state = await getUserCompetitiveState(discordId);
  if (state !== CompetitiveState.EnCola) {
    return { left: false, reason: "No estás en la cola." };
  }

  const lobby = await lobbyRepository.findQueueLobby();
  if (!lobby) return { left: false, reason: "No hay cola activa." };

  await lobbyRepository.removeParticipant(lobby.id, discordId);
  const count = await lobbyRepository.countParticipants(lobby.id);

  logger.info({ discordId, lobbyId: lobby.id, count }, "Player left queue");
  eventBus.emit("player:left_queue", { discordId, lobbyId: lobby.id });

  return { left: true };
}

/** Return current queue snapshot (no mutations). */
export async function getQueueStatus(): Promise<{
  lobby: Awaited<ReturnType<typeof lobbyRepository.findQueueLobby>>;
  count: number;
  max: number;
}> {
  const lobby = await lobbyRepository.findQueueLobby();
  const count = lobby ? await lobbyRepository.countParticipants(lobby.id) : 0;
  const max   = await getConfigInt(ConfigKey.MaxPlayers, 10);
  return { lobby, count, max };
}

// ── Internal ───────────────────────────────────────────────────────────────

async function onQueueFull(
  lobbyId: string,
  guildId: string,
  client: Client,
): Promise<void> {
  logger.info({ lobbyId }, "Queue full — transitioning to WAITING_SUPERVISOR");

  const participants = await lobbyRepository.listParticipants(lobbyId);
  const participantIds = participants.map((p) => p.discordId);

  await transitionTo(lobbyId, LobbyStatus.WaitingSupervisor);
  eventBus.emit("queue:full", { lobbyId, guildId, participantIds });

  // Begin FIFO supervisor assignment
  await assignNextSupervisor(lobbyId, client);
}

function stateMessage(state: CompetitiveState): string {
  switch (state) {
    case CompetitiveState.EnCola:    return "Ya estás en la cola.";
    case CompetitiveState.EnLobby:   return "Ya estás en un lobby en preparación.";
    case CompetitiveState.EnPartida: return "Ya estás en una partida activa.";
    default:                          return "Estado desconocido.";
  }
}
