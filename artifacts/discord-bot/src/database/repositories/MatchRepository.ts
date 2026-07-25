// ---------------------------------------------------------------------------
// MatchRepository — CRUD for `partidas`, `participantes_partida`,
//                   `historial_elo`, `votos_mvp`.
// No ELO calculation logic lives here — only persistence.
// ---------------------------------------------------------------------------

import { eq, and, desc, count, sql } from "drizzle-orm";
import { db } from "../database";
import {
  partidasTable,
  participantesPartidaTable,
  historialEloTable,
  votosMvpTable,
  type InsertPartida,
  type Partida,
  type InsertParticipantePartida,
  type ParticipantePartida,
  type InsertHistorialElo,
  type HistorialElo,
  type InsertVotoMvp,
  type VotoMvp,
} from "@workspace/db";
import { type MatchStatus, type ParticipantStatus } from "../enums";

export class MatchRepository {
  // ── Partidas ──────────────────────────────────────────────────────────────

  async findById(id: string): Promise<Partida | undefined> {
    const rows = await db
      .select()
      .from(partidasTable)
      .where(eq(partidasTable.id, id))
      .limit(1);
    return rows[0];
  }

  /** Find the most recent partida associated with a lobby. */
  async findByLobbyId(lobbyId: string): Promise<Partida | undefined> {
    const rows = await db
      .select()
      .from(partidasTable)
      .where(eq(partidasTable.lobbyId, lobbyId))
      .orderBy(desc(partidasTable.createdAt))
      .limit(1);
    return rows[0];
  }

  /** Update the rol of a single participant in a partida. */
  async updateParticipantRol(
    partidaId: string,
    discordId: string,
    rol: string,
  ): Promise<void> {
    await db
      .update(participantesPartidaTable)
      .set({ rol })
      .where(
        and(
          eq(participantesPartidaTable.partidaId, partidaId),
          eq(participantesPartidaTable.discordId, discordId),
        ),
      );
  }

  async create(data: InsertPartida): Promise<Partida> {
    const rows = await db.insert(partidasTable).values(data).returning();
    return rows[0]!;
  }

  async updateStatus(
    id: string,
    status: MatchStatus,
    ganadorEquipo?: number,
  ): Promise<void> {
    await db
      .update(partidasTable)
      .set({
        status,
        ganadorEquipo: ganadorEquipo ?? null,
        finishedAt:    status !== "in_progress" ? sql`now()` : undefined,
      })
      .where(eq(partidasTable.id, id));
  }

  // ── Participantes ─────────────────────────────────────────────────────────

  async addParticipant(data: InsertParticipantePartida): Promise<ParticipantePartida> {
    const rows = await db
      .insert(participantesPartidaTable)
      .values(data)
      .returning();
    return rows[0]!;
  }

  async listParticipants(partidaId: string): Promise<ParticipantePartida[]> {
    return db
      .select()
      .from(participantesPartidaTable)
      .where(eq(participantesPartidaTable.partidaId, partidaId));
  }

  async updateParticipantStatus(
    partidaId: string,
    discordId: string,
    status: ParticipantStatus,
  ): Promise<void> {
    await db
      .update(participantesPartidaTable)
      .set({ status })
      .where(
        and(
          eq(participantesPartidaTable.partidaId, partidaId),
          eq(participantesPartidaTable.discordId, discordId),
        ),
      );
  }

  // ── ELO history ───────────────────────────────────────────────────────────

  async recordEloChange(data: InsertHistorialElo): Promise<HistorialElo> {
    const rows = await db.insert(historialEloTable).values(data).returning();
    return rows[0]!;
  }

  async listEloHistory(discordId: string, limit = 20): Promise<HistorialElo[]> {
    return db
      .select()
      .from(historialEloTable)
      .where(eq(historialEloTable.discordId, discordId))
      .orderBy(desc(historialEloTable.createdAt))
      .limit(limit);
  }

  // ── MVP votes ─────────────────────────────────────────────────────────────

  async addVotoMvp(data: InsertVotoMvp): Promise<VotoMvp> {
    const rows = await db.insert(votosMvpTable).values(data).returning();
    return rows[0]!;
  }

  async hasVoted(partidaId: string, votanteId: string): Promise<boolean> {
    const rows = await db
      .select({ id: votosMvpTable.id })
      .from(votosMvpTable)
      .where(
        and(
          eq(votosMvpTable.partidaId, partidaId),
          eq(votosMvpTable.votanteId, votanteId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /** Returns { discordId, votes } sorted by vote count descending. */
  async tallyMvpVotes(
    partidaId: string,
  ): Promise<Array<{ discordId: string; votes: number }>> {
    const rows = await db
      .select({ discordId: votosMvpTable.votadoId, votes: count() })
      .from(votosMvpTable)
      .where(eq(votosMvpTable.partidaId, partidaId))
      .groupBy(votosMvpTable.votadoId);
    return rows
      .map((r) => ({ discordId: r.discordId, votes: Number(r.votes) }))
      .sort((a, b) => b.votes - a.votes);
  }
}

export const matchRepository = new MatchRepository();
