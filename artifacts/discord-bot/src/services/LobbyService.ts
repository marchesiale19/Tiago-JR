
import { eq, and, count, sql, inArray, isNull } from "drizzle-orm";
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
  async findById(id: string): Promise<Lobby | undefined> {
    const rows = await db
      .select()
      .from(lobbysTable)
      .where(eq(lobbysTable.id, id))
      .limit(1);

    return rows[0];
  }

  async findQueueLobby(): Promise<Lobby | undefined> {
    const rows = await db
      .select()
      .from(lobbysTable)
      .where(eq(lobbysTable.status, "queue"))
      .limit(1);

    return rows[0];
  }

  async findByStatus(status: LobbyStatus | LobbyStatus[]): Promise<Lobby[]> {
    const statuses = Array.isArray(status) ? status : [status];

    return db
      .select()
      .from(lobbysTable)
      .where(inArray(lobbysTable.status, statuses));
  }

  async findActiveForUser(
    discordId: string,
  ): Promise<Lobby | undefined> {
    const activeStatuses: LobbyStatus[] = [
      "queue",
      "waiting_supervisor",
      "ready",
      "in_game",
      "validating",
    ];

    const rows = await db
      .select({ lobby: lobbysTable })
      .from(lobbysTable)
      .innerJoin(
        participantesLobbyTable,
        and(
          eq(participantesLobbyTable.lobbyId, lobbysTable.id),
          eq(participantesLobbyTable.discordId, discordId),
        ),
      )
      .where(inArray(lobbysTable.status, activeStatuses))
      .limit(1);

    return rows[0]?.lobby;
  }

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

  async findByChannelId(
    channelId: string,
  ): Promise<Lobby | undefined> {
    const rows = await db
      .select()
      .from(lobbysTable)
      .where(eq(lobbysTable.channelId, channelId))
      .limit(1);

    return rows[0];
  }

  async create(data: InsertLobby): Promise<Lobby> {
    const rows = await db
      .insert(lobbysTable)
      .values(data)
      .returning();

    return rows[0]!;
  }

  async updateStatus(
    id: string,
    status: LobbyStatus,
  ): Promise<void> {
    await db
      .update(lobbysTable)
      .set({
        status,
        updatedAt: sql`now()`,
      })
      .where(eq(lobbysTable.id, id));
  }

  async updateSupervisor(
    id: string,
    supervisorId: string,
    notifiedAt: Date,
  ): Promise<void> {
    await db
      .update(lobbysTable)
      .set({
        supervisorId,
        supervisorNotifiedAt: notifiedAt,
        updatedAt: sql`now()`,
      })
      .where(eq(lobbysTable.id, id));
  }

  /**
   * Reserva la supervisión para un solo usuario.
   * Solo funciona si la lobby sigue esperando supervisor
   * y todavía no tiene uno asignado.
   */
  async claimSupervisor(
    lobbyId: string,
    supervisorId: string,
    notifiedAt: Date,
  ): Promise<boolean> {
    const rows = await db
      .update(lobbysTable)
      .set({
        supervisorId,
        supervisorNotifiedAt: notifiedAt,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(lobbysTable.id, lobbyId),
          eq(lobbysTable.status, "waiting_supervisor"),
          isNull(lobbysTable.supervisorId),
        ),
      )
      .returning({ id: lobbysTable.id });

    return rows.length > 0;
  }

  async updateChannels(
    id: string,
    textChannelId: string,
    voiceChannelId: string,
  ): Promise<void> {
    await db
      .update(lobbysTable)
      .set({
        textChannelId,
        voiceChannelId,
        updatedAt: sql`now()`,
      })
      .where(eq(lobbysTable.id, id));
  }

  async countParticipants(lobbyId: string): Promise<number> {
    const rows = await db
      .select({ value: count() })
      .from(participantesLobbyTable)
      .where(eq(participantesLobbyTable.lobbyId, lobbyId));

    return Number(rows[0]?.value ?? 0);
  }

  async listParticipants(
    lobbyId: string,
  ): Promise<ParticipanteLobby[]> {
    return db
      .select()
      .from(participantesLobbyTable)
      .where(eq(participantesLobbyTable.lobbyId, lobbyId));
  }

  async addParticipant(
    data: InsertParticipanteLobby,
  ): Promise<ParticipanteLobby> {
    const rows = await db
      .insert(participantesLobbyTable)
      .values(data)
      .returning();

    return rows[0]!;
  }

  async removeParticipant(
    lobbyId: string,
    discordId: string,
  ): Promise<void> {
    await db
      .delete(participantesLobbyTable)
      .where(
        and(
          eq(participantesLobbyTable.lobbyId, lobbyId),
          eq(participantesLobbyTable.discordId, discordId),
        ),
      );
  }

  async clearParticipants(lobbyId: string): Promise<void> {
    await db
      .delete(participantesLobbyTable)
      .where(eq(participantesLobbyTable.lobbyId, lobbyId));
  }
}

export const lobbyRepository = new LobbyRepository();
