// ---------------------------------------------------------------------------
// LobbyRepository — CRUD for `lobbys` and `participantes_lobby`.
// cant_actual is always derived via countParticipants() — never stored.
// ---------------------------------------------------------------------------

import { eq, and, count, sql, inArray } from "drizzle-orm";
import { db } from "../database";
import {
  lobbysTable,
  participantesLobbyTable,
  type InsertLobby,
  type Lobby,
  type InsertParticipanteLobby,
  type ParticipanteLobby,
} from "@workspace/db";
import { type LobbyStatus } from "../enums";

export class LobbyRepository {
  /** Find a lobby by UUID. */
  async findById(id: string): Promise<Lobby | undefined> {
    const rows = await db
      .select()
      .from(lobbysTable)
      .where(eq(lobbysTable.id, id))
      .limit(1);
    return rows[0];
  }

  /** Find the single active QUEUE lobby, if any. */
  async findQueueLobby(): Promise<Lobby | undefined> {
    const rows = await db
      .select()
      .from(lobbysTable)
      .where(eq(lobbysTable.status, "queue"))
      .limit(1);
    return rows[0];
  }

  /** Find all lobbies in the given status(es). */
  async findByStatus(status: LobbyStatus | LobbyStatus[]): Promise<Lobby[]> {
    const statuses = Array.isArray(status) ? status : [status];
    return db
      .select()
      .from(lobbysTable)
      .where(inArray(lobbysTable.status, statuses));
  }

  /** Find the active lobby a user is currently participating in. */
  async findActiveForUser(discordId: string): Promise<Lobby | undefined> {
    const activeStatuses: LobbyStatus[] = [
      "queue", "waiting_supervisor", "ready", "in_game", "validating",
    ];
    const rows = await db
      .select({ lobby: lobbysTable })
      .from(lobbysTable)
      .innerJoin(
        participantesLobbyTable,
        and(
          eq(participantesLobbyTable.lobbyId,   lobbysTable.id),
          eq(participantesLobbyTable.discordId, discordId),
        ),
      )
      .where(inArray(lobbysTable.status, activeStatuses))
      .limit(1);
    return rows[0]?.lobby;
  }

  /** Find the lobby assigned to a specific supervisor in the given status. */
  async findBySupervisorAndStatus(
    supervisorId: string,
    status: LobbyStatus,
  ): Promise<Lobby | undefined> {
    const rows = await db
      .select()
      .from(lobbysTable)
      .where(
        and(
          eq(lobbysTable.supervisorId, supervisorId),
          eq(lobbysTable.status, status),
        ),
      )
      .limit(1);
    return rows[0];
  }

  /** Find an open lobby by Discord channel ID. */
  async findByChannelId(channelId: string): Promise<Lobby | undefined> {
    const rows = await db
      .select()
      .from(lobbysTable)
      .where(eq(lobbysTable.channelId, channelId))
      .limit(1);
    return rows[0];
  }

  /** Create a lobby. */
  async create(data: InsertLobby): Promise<Lobby> {
    const rows = await db.insert(lobbysTable).values(data).returning();
    return rows[0]!;
  }

  /** Update lobby status and touch updatedAt. */
  async updateStatus(id: string, status: LobbyStatus): Promise<void> {
    await db
      .update(lobbysTable)
      .set({ status, updatedAt: sql`now()` })
      .where(eq(lobbysTable.id, id));
  }

  /** Assign a supervisor and record notification timestamp. */
  async updateSupervisor(
    id: string,
    supervisorId: string,
    notifiedAt: Date,
  ): Promise<void> {
    await db
      .update(lobbysTable)
      .set({ supervisorId, supervisorNotifiedAt: notifiedAt, updatedAt: sql`now()` })
      .where(eq(lobbysTable.id, id));
  }

  /** Store Discord channel IDs created for this lobby on READY. */
  async updateChannels(
    id: string,
    textChannelId: string,
    voiceChannelId: string,
  ): Promise<void> {
    await db
      .update(lobbysTable)
      .set({ textChannelId, voiceChannelId, updatedAt: sql`now()` })
      .where(eq(lobbysTable.id, id));
  }

  /** Count current participants (derives cant_actual). */
  async countParticipants(lobbyId: string): Promise<number> {
    const rows = await db
      .select({ value: count() })
      .from(participantesLobbyTable)
      .where(eq(participantesLobbyTable.lobbyId, lobbyId));
    return Number(rows[0]?.value ?? 0);
  }

  /** List all participants in a lobby. */
  async listParticipants(lobbyId: string): Promise<ParticipanteLobby[]> {
    return db
      .select()
      .from(participantesLobbyTable)
      .where(eq(participantesLobbyTable.lobbyId, lobbyId));
  }

  /** Add a participant to a lobby. Throws on duplicate (same user, same lobby). */
  async addParticipant(data: InsertParticipanteLobby): Promise<ParticipanteLobby> {
    const rows = await db
      .insert(participantesLobbyTable)
      .values(data)
      .returning();
    return rows[0]!;
  }

  /** Remove a participant from a lobby. */
  async removeParticipant(lobbyId: string, discordId: string): Promise<void> {
    await db
      .delete(participantesLobbyTable)
      .where(
        and(
          eq(participantesLobbyTable.lobbyId,   lobbyId),
          eq(participantesLobbyTable.discordId, discordId),
        ),
      );
  }

  /** Remove all participants from a lobby (used when closing/cancelling). */
  async clearParticipants(lobbyId: string): Promise<void> {
    await db
      .delete(participantesLobbyTable)
      .where(eq(participantesLobbyTable.lobbyId, lobbyId));
  }
}

export const lobbyRepository = new LobbyRepository();
