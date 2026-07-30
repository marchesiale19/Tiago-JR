// ---------------------------------------------------------------------------
// QueueService — join/leave queue, voice-channel validation, queue-full dispatch.
//
// Rules:
//   • Queue size is always 14 players (hardcoded per spec).
//   • The calling player MUST be in a voice channel matching the Among Us VC
//     pattern: /^「🎙」among us \d+$/i
//   • On queue full: create/reuse a Ranked VC, move all 14 players, then post
//     a supervision request embed in the configured supervision channel.
// ---------------------------------------------------------------------------

import { Client, Guild } from "discord.js";
import { lobbyRepository }  from "../database/repositories/LobbyRepository";
import { LobbyStatus, CompetitiveState } from "../database/enums";
import { getUserCompetitiveState, getOrCreateQueueLobby, transitionTo } from "./LobbyService";
import { sendSupervisionRequest } from "./SupervisorService";
import { getOrCreateRankedVC, movePlayersToVC } from "./RankedVCService";
import { eventBus } from "./EventBus";
import { logger } from "../lib/logger";

const QUEUE_SIZE = 14;

/** Regex that matches  「🎙」among us 1 ,  「🎙」among us 2 , etc. */
export const AMONG_US_VC_PATTERN = /^「🎙」among us \d+$/i;

// ── Public API ─────────────────────────────────────────────────────────────

export interface JoinResult {
  joined:  boolean;
  reason?: string;
  count:   number;
  max:     number;
}

/**
 * Add a player to the queue.
 * @param voiceChannelName  Name of the voice channel the player is currently in.
 *                          Pass null/undefined if the player is not in any VC.
 */
export async function joinQueue(
  discordId:        string,
  guildId:          string,
  client:           Client,
  voiceChannelName: string | null | undefined,
): Promise<JoinResult> {
  // ── Validate voice channel ────────────────────────────────────────────────
  if (!voiceChannelName || !AMONG_US_VC_PATTERN.test(voiceChannelName)) {
    return {
      joined: false,
      reason: "Debes estar conectado a un canal de voz de Among Us (ej: 「🎙」among us 1) para buscar partida.",
      count:  0,
      max:    QUEUE_SIZE,
    };
  }

  // ── Validate competitive state ────────────────────────────────────────────
  const state = await getUserCompetitiveState(discordId);
  if (state !== CompetitiveState.Libre) {
    return { joined: false, reason: stateMessage(state), count: 0, max: QUEUE_SIZE };
  }

  const lobby = await getOrCreateQueueLobby(guildId, discordId);

  if (lobby.status !== LobbyStatus.Queue) {
    return {
      joined: false,
      reason: "La cola se está procesando. Inténtalo de nuevo en un momento.",
      count:  0,
      max:    QUEUE_SIZE,
    };
  }

  try {
    await lobbyRepository.addParticipant({ lobbyId: lobby.id, discordId });
  } catch (err: any) {
    if (err?.code === "23505") {
      return {
        joined: false,
        reason: "Ya estás en la cola.",
        count:  await lobbyRepository.countParticipants(lobby.id),
        max:    QUEUE_SIZE,
      };
    }
    throw err;
  }

  const count = await lobbyRepository.countParticipants(lobby.id);
  logger.info({ discordId, lobbyId: lobby.id, count, max: QUEUE_SIZE }, "Player joined queue");
  eventBus.emit("player:joined_queue", { discordId, lobbyId: lobby.id });

  if (count >= QUEUE_SIZE) {
    await onQueueFull(lobby.id, guildId, client);
  }

  return { joined: true, count, max: QUEUE_SIZE };
}

/** Remove a player from the queue. */
export async function leaveQueue(discordId: string): Promise<{ left: boolean; reason?: string }> {
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
  lobby:  Awaited<ReturnType<typeof lobbyRepository.findQueueLobby>>;
  count:  number;
  max:    number;
}> {
  const lobby = await lobbyRepository.findQueueLobby();
  const count = lobby ? await lobbyRepository.countParticipants(lobby.id) : 0;
  return { lobby, count, max: QUEUE_SIZE };
}

// ── Internal ───────────────────────────────────────────────────────────────

async function onQueueFull(lobbyId: string, guildId: string, client: Client): Promise<void> {
  logger.info({ lobbyId }, "Queue full — starting ranked match flow");

  const participants   = await lobbyRepository.listParticipants(lobbyId);
  const participantIds = participants.map((p) => p.discordId);

  await transitionTo(lobbyId, LobbyStatus.WaitingSupervisor);
  eventBus.emit("queue:full", { lobbyId, guildId, participantIds });

  // Fetch guild and create/reuse Ranked VC
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    logger.error({ guildId }, "Guild not found — cannot start ranked match");
    return;
  }

  let rankedVC;
  try {
    rankedVC = await getOrCreateRankedVC(guild);
  } catch (err) {
    logger.error({ err }, "Failed to get/create Ranked VC");
    return;
  }

  // Store VC on lobby
  await lobbyRepository.updateChannels(lobbyId, "", rankedVC.id);

  // Move all 14 players into the Ranked VC
  await guild.members.fetch();
  const { moved, skipped } = await movePlayersToVC(guild, rankedVC.id, participantIds);
  logger.info({ lobbyId, moved: moved.length, skipped: skipped.length }, "Players moved to Ranked VC");

  // Post supervision request embed in the configured channel
  await sendSupervisionRequest(lobbyId, guildId, rankedVC.id, rankedVC.name, client);
}

function stateMessage(state: CompetitiveState): string {
  switch (state) {
    case CompetitiveState.EnCola:    return "Ya estás en la cola.";
    case CompetitiveState.EnLobby:   return "Ya estás en un lobby en preparación.";
    case CompetitiveState.EnPartida: return "Ya estás en una partida activa.";
    default:                          return "Estado desconocido.";
  }
}
