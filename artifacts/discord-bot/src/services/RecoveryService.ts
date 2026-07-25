// ---------------------------------------------------------------------------
// RecoveryService — boot-time recovery for interrupted lobbies and matches.
// Called from initDatabase() before the bot accepts interactions.
//
// Rules:
//   - QUEUE duplicates: keep the oldest, delete the rest.
//   - WAITING_SUPERVISOR / READY: mark CANCELLED (supervisor state is unknown).
//   - IN_GAME / VALIDATING matches: set requires_revision = true.
// ---------------------------------------------------------------------------

import { Client } from "discord.js";
import { eq, inArray, asc } from "drizzle-orm";
import { lobbyRepository } from "../database/repositories/LobbyRepository";
import { supervisorRepository } from "../database/repositories/SupervisorRepository";
import { db } from "../database/database";
import { lobbysTable, partidasTable } from "@workspace/db";
import { LobbyStatus, MatchStatus } from "../database/enums";
import { logger } from "../lib/logger";

export async function runRecovery(client: Client): Promise<void> {
  logger.info("Running startup recovery…");

  await Promise.all([
    resolveOrphanQueues(),
    cancelInterruptedLobbies(client),
    flagCrashedMatches(),
    releaseSupervisors(),
  ]);

  logger.info("Startup recovery complete.");
}

/** Keep the oldest QUEUE lobby, cancel any extras (race condition backstop). */
async function resolveOrphanQueues(): Promise<void> {
  const queueLobbies = await db
    .select()
    .from(lobbysTable)
    .where(eq(lobbysTable.status, LobbyStatus.Queue))
    .orderBy(asc(lobbysTable.createdAt));

  if (queueLobbies.length <= 1) return;

  const [, ...duplicates] = queueLobbies; // keep first (oldest), cancel rest
  for (const lobby of duplicates) {
    await lobbyRepository.updateStatus(lobby.id, LobbyStatus.Cancelled);
    logger.warn({ lobbyId: lobby.id }, "Duplicate QUEUE lobby cancelled on startup");
  }
}

/**
 * Mark WAITING_SUPERVISOR and READY lobbies as CANCELLED.
 * The supervisor link is unknown after a restart, so we clean state and
 * let players rejoin the queue manually.
 */
async function cancelInterruptedLobbies(client: Client): Promise<void> {
  const interrupted = await lobbyRepository.findByStatus([
    LobbyStatus.WaitingSupervisor,
    LobbyStatus.Ready,
  ]);

  for (const lobby of interrupted) {
    await lobbyRepository.updateStatus(lobby.id, LobbyStatus.Cancelled);
    logger.warn({ lobbyId: lobby.id, status: lobby.status }, "Interrupted lobby cancelled on startup");

    // Best-effort channel deletion (may already be gone)
    if ((lobby.textChannelId || lobby.voiceChannelId) && lobby.guildId) {
      try {
        const guild = await client.guilds.fetch(lobby.guildId);
        if (lobby.textChannelId) {
          const ch = guild.channels.cache.get(lobby.textChannelId);
          if (ch) await ch.delete("Bot restart recovery");
        }
        if (lobby.voiceChannelId) {
          const ch = guild.channels.cache.get(lobby.voiceChannelId);
          if (ch) await ch.delete("Bot restart recovery");
        }
      } catch { /* best effort */ }
    }
  }
}

/**
 * Flag IN_GAME and VALIDATING matches as requiring staff revision.
 * These were interrupted mid-game and cannot be auto-resolved.
 */
async function flagCrashedMatches(): Promise<void> {
  const crashedStatuses = [MatchStatus.InProgress];
  const result = await db
    .update(partidasTable)
    .set({ requiresRevision: true })
    .where(inArray(partidasTable.status, crashedStatuses))
    .returning({ id: partidasTable.id });

  if (result.length > 0) {
    logger.warn({ matchIds: result.map((r) => r.id) }, "Matches flagged requires_revision after crash");
  }
}

/** Release any supervisors that were marked occupied but have no active lobby. */
async function releaseSupervisors(): Promise<void> {
  const activeStatuses: LobbyStatus[] = [
    LobbyStatus.WaitingSupervisor,
    LobbyStatus.Ready,
    LobbyStatus.InGame,
    LobbyStatus.Validating,
  ];

  // Find supervisor IDs that are in an active lobby
  const activeLobbies = await lobbyRepository.findByStatus(activeStatuses);
  const activeSupervisorIds = new Set(
    activeLobbies.map((l) => l.supervisorId).filter(Boolean) as string[],
  );

  // Release all occupied supervisors that have no active lobby
  const allSupervisors = await supervisorRepository.listAll();
  for (const sup of allSupervisors) {
    if (sup.ocupado && !activeSupervisorIds.has(sup.discordId)) {
      await supervisorRepository.setOcupado(sup.discordId, false);
      logger.info({ discordId: sup.discordId }, "Supervisor released on recovery (no active lobby)");
    }
  }
}
