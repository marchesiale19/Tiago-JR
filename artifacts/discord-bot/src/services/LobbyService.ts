// ---------------------------------------------------------------------------
// LobbyService — lobby state machine transitions.
//
// In the new ranked workflow there are no private text channels per match.
// The Ranked VC lifecycle is managed by RankedVCService.
// This service owns:
//   • State machine validation and transitions.
//   • Queue lobby creation.
//   • Derived user competitive state.
//   • Lobby closure (status update + supervisor state cleanup).
// ---------------------------------------------------------------------------

import { Client } from "discord.js";
import { lobbyRepository }      from "../database/repositories/LobbyRepository";
import { supervisorRepository } from "../database/repositories/SupervisorRepository";
import {
  LobbyStatus, LOBBY_TRANSITIONS, CompetitiveState,
} from "../database/enums";
import { eventBus } from "./EventBus";
import { logger }   from "../lib/logger";
import type { Lobby } from "@workspace/db";

// ── State machine ──────────────────────────────────────────────────────────

export function validateTransition(from: LobbyStatus, to: LobbyStatus): void {
  const allowed = LOBBY_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid lobby transition: ${from} → ${to}`);
  }
}

export async function transitionTo(lobbyId: string, newStatus: LobbyStatus): Promise<Lobby> {
  const lobby = await lobbyRepository.findById(lobbyId);
  if (!lobby) throw new Error(`Lobby ${lobbyId} not found`);

  validateTransition(lobby.status as LobbyStatus, newStatus);
  await lobbyRepository.updateStatus(lobbyId, newStatus);
  logger.info({ lobbyId, from: lobby.status, to: newStatus }, "Lobby status transition");
  return { ...lobby, status: newStatus };
}

// ── Queue lobby management ─────────────────────────────────────────────────

export async function getOrCreateQueueLobby(guildId: string, creadorId: string): Promise<Lobby> {
  const existing = await lobbyRepository.findQueueLobby();
  if (existing) return existing;

  const lobby = await lobbyRepository.create({
    creadorId,
    guildId,
    status:       LobbyStatus.Queue,
    maxJugadores: 14,
  });
  logger.info({ lobbyId: lobby.id }, "New QUEUE lobby created (max 14)");
  return lobby;
}

// ── Derived user competitive state ─────────────────────────────────────────

export async function getUserCompetitiveState(discordId: string): Promise<CompetitiveState> {
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

// ── Lobby closure (CLOSED or CANCELLED) ───────────────────────────────────

export async function closeLobby(
  lobbyId:   string,
  newStatus: LobbyStatus.Closed | LobbyStatus.Cancelled,
  _client:   Client,
): Promise<void> {
  const lobby = await lobbyRepository.findById(lobbyId);
  if (!lobby) return;

  validateTransition(lobby.status as LobbyStatus, newStatus);
  await lobbyRepository.updateStatus(lobbyId, newStatus);

  // Release supervisor record if one was tracked
  if (lobby.supervisorId) {
    await supervisorRepository.setOcupado(lobby.supervisorId, false).catch(() => {});
  }

  eventBus.emit("lobby:cancelled", { lobbyId, supervisorId: lobby.supervisorId ?? null });
  logger.info({ lobbyId, status: newStatus }, "Lobby closed");
}
