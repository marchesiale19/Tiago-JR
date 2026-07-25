// ---------------------------------------------------------------------------
// LobbyService — state machine transitions and Discord channel lifecycle.
// All transitions are validated here; no business logic leaks into repositories.
// ---------------------------------------------------------------------------

import {
  Client, Guild, ChannelType, PermissionFlagsBits,
  EmbedBuilder, TextChannel, VoiceChannel,
} from "discord.js";
import { lobbyRepository } from "../database/repositories/LobbyRepository";
import { supervisorRepository } from "../database/repositories/SupervisorRepository";
import {
  LobbyStatus, LOBBY_TRANSITIONS, CompetitiveState,
} from "../database/enums";
import { getConfig, getConfigInt } from "./ConfigService";
import { ConfigKey } from "../database/enums";
import { eventBus } from "./EventBus";
import { logger } from "../lib/logger";
import type { Lobby } from "@workspace/db";

// ── State machine ──────────────────────────────────────────────────────────

export function validateTransition(from: LobbyStatus, to: LobbyStatus): void {
  const allowed = LOBBY_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid lobby transition: ${from} → ${to}`);
  }
}

export async function transitionTo(
  lobbyId: string,
  newStatus: LobbyStatus,
): Promise<Lobby> {
  const lobby = await lobbyRepository.findById(lobbyId);
  if (!lobby) throw new Error(`Lobby ${lobbyId} not found`);

  validateTransition(lobby.status as LobbyStatus, newStatus);
  await lobbyRepository.updateStatus(lobbyId, newStatus);
  logger.info({ lobbyId, from: lobby.status, to: newStatus }, "Lobby status transition");
  return { ...lobby, status: newStatus };
}

// ── Queue lobby management ─────────────────────────────────────────────────

export async function getOrCreateQueueLobby(
  guildId: string,
  creadorId: string,
): Promise<Lobby> {
  const existing = await lobbyRepository.findQueueLobby();
  if (existing) return existing;

  const maxJugadores = await getConfigInt(ConfigKey.MaxPlayers, 10);
  const lobby = await lobbyRepository.create({
    creadorId,
    guildId,
    status:       LobbyStatus.Queue,
    maxJugadores,
  });
  logger.info({ lobbyId: lobby.id, maxJugadores }, "New QUEUE lobby created");
  return lobby;
}

// ── Derived user competitive state ─────────────────────────────────────────

export async function getUserCompetitiveState(
  discordId: string,
): Promise<CompetitiveState> {
  const lobby = await lobbyRepository.findActiveForUser(discordId);
  if (!lobby) return CompetitiveState.Libre;

  switch (lobby.status as LobbyStatus) {
    case LobbyStatus.Queue:            return CompetitiveState.EnCola;
    case LobbyStatus.WaitingSupervisor:
    case LobbyStatus.Ready:            return CompetitiveState.EnLobby;
    case LobbyStatus.InGame:
    case LobbyStatus.Validating:       return CompetitiveState.EnPartida;
    default:                           return CompetitiveState.Libre;
  }
}

// ── Discord channel lifecycle ──────────────────────────────────────────────

export async function createMatchChannels(
  lobbyId: string,
  guild: Guild,
  supervisorId: string,
  participantIds: string[],
): Promise<{ textChannelId: string; voiceChannelId: string }> {
  const categoryId = await getConfig(ConfigKey.CategoryId);
  const shortId    = lobbyId.slice(0, 8);

  const permissionOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: supervisorId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect] },
    ...participantIds.map((id) => ({
      id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect],
    })),
  ];

  const textCh = await guild.channels.create({
    name:                `partida-${shortId}`,
    type:                ChannelType.GuildText,
    parent:              categoryId || undefined,
    permissionOverwrites,
  });

  const voiceCh = await guild.channels.create({
    name:                `VC-${shortId}`,
    type:                ChannelType.GuildVoice,
    parent:              categoryId || undefined,
    permissionOverwrites,
  });

  await lobbyRepository.updateChannels(lobbyId, textCh.id, voiceCh.id);
  logger.info({ lobbyId, textChannelId: textCh.id, voiceChannelId: voiceCh.id }, "Match channels created");

  return { textChannelId: textCh.id, voiceChannelId: voiceCh.id };
}

export async function deleteMatchChannels(
  lobby: Lobby,
  client: Client,
): Promise<void> {
  const guildId = lobby.guildId;
  if (!guildId) return;

  try {
    const guild = await client.guilds.fetch(guildId);
    if (lobby.textChannelId) {
      const ch = guild.channels.cache.get(lobby.textChannelId);
      if (ch) await ch.delete("Lobby closed");
    }
    if (lobby.voiceChannelId) {
      const ch = guild.channels.cache.get(lobby.voiceChannelId);
      if (ch) await ch.delete("Lobby closed");
    }
    logger.info({ lobbyId: lobby.id }, "Match channels deleted");
  } catch (err) {
    logger.warn({ err, lobbyId: lobby.id }, "Failed to delete match channels");
  }
}

// ── Lobby closure (CLOSED or CANCELLED) ───────────────────────────────────

export async function closeLobby(
  lobbyId: string,
  newStatus: "closed" | "cancelled",
  client: Client,
): Promise<void> {
  const lobby = await lobbyRepository.findById(lobbyId);
  if (!lobby) return;

  validateTransition(lobby.status as LobbyStatus, newStatus);
  await lobbyRepository.updateStatus(lobbyId, newStatus);

  // Restore supervisor availability if one was assigned
  if (lobby.supervisorId) {
    await supervisorRepository.setOcupado(lobby.supervisorId, false);
    logger.info({ supervisorId: lobby.supervisorId }, "Supervisor availability restored");
  }

  // Clean up Discord channels
  if (lobby.textChannelId || lobby.voiceChannelId) {
    await deleteMatchChannels(lobby, client);
  }

  eventBus.emit("lobby:cancelled", {
    lobbyId,
    supervisorId: lobby.supervisorId ?? null,
  });
  logger.info({ lobbyId, status: newStatus }, "Lobby closed");
}
