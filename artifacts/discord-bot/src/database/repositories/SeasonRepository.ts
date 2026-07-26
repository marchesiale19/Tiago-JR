// ---------------------------------------------------------------------------
// SeasonRepository — CRUD for `temporadas` and `estadisticas_temporada`.
// ---------------------------------------------------------------------------

import { eq, and, desc, sum } from "drizzle-orm";
import { db } from "../database";
import {
  temporadasTable,
  estadisticasTemporadaTable,
  type InsertTemporada,
  type Temporada,
  type InsertEstadisticaTemporada,
  type EstadisticaTemporada,
} from "@workspace/db";

export class SeasonRepository {
  /** Find a season by PK. */
  async findById(id: number): Promise<Temporada | undefined> {
    const rows = await db
      .select()
      .from(temporadasTable)
      .where(eq(temporadasTable.id, id))
      .limit(1);
    return rows[0];
  }

  /** Return the currently active season, or undefined if none. */
  async findActive(): Promise<Temporada | undefined> {
    const rows = await db
      .select()
      .from(temporadasTable)
      .where(eq(temporadasTable.activa, true))
      .limit(1);
    return rows[0];
  }

  /** Create a new season. */
  async create(data: InsertTemporada): Promise<Temporada> {
    const rows = await db.insert(temporadasTable).values(data).returning();
    return rows[0]!;
  }

  /** Mark a season as closed (activa = false, record fecha_fin). */
  async close(id: number, fechaFin: Date): Promise<void> {
    await db
      .update(temporadasTable)
      .set({ activa: false, fechaFin })
      .where(eq(temporadasTable.id, id));
  }

  /** List all seasons ordered by id desc. */
  async list(): Promise<Temporada[]> {
    return db.select().from(temporadasTable).orderBy(desc(temporadasTable.id));
  }

  // ── Season stats ──────────────────────────────────────────────────────────

  /** Get per-season stats for one player. */
  async findStats(
    discordId: string,
    temporadaId: number,
  ): Promise<EstadisticaTemporada | undefined> {
    const rows = await db
      .select()
      .from(estadisticasTemporadaTable)
      .where(
        and(
          eq(estadisticasTemporadaTable.discordId, discordId),
          eq(estadisticasTemporadaTable.temporadaId, temporadaId),
        ),
      )
      .limit(1);
    return rows[0];
  }

  /** Upsert season stats row for a player. */
  async upsertStats(data: InsertEstadisticaTemporada): Promise<EstadisticaTemporada> {
    const rows = await db
      .insert(estadisticasTemporadaTable)
      .values(data)
      .onConflictDoUpdate({
        target: [
          estadisticasTemporadaTable.discordId,
          estadisticasTemporadaTable.temporadaId,
        ],
        set: data,
      })
      .returning();
    return rows[0]!;
  }

  /** Leaderboard for a season, ordered by ELO desc. */
  async leaderboard(temporadaId: number, limit = 50): Promise<EstadisticaTemporada[]> {
    return db
      .select()
      .from(estadisticasTemporadaTable)
      .where(eq(estadisticasTemporadaTable.temporadaId, temporadaId))
      .orderBy(desc(estadisticasTemporadaTable.elo))
      .limit(limit);
  }

  // ── Lifetime aggregates ───────────────────────────────────────────────────

  /**
   * Sum `victorias`, `partidas_jugadas`, and `mvp_count` across ALL seasons
   * for a player. Used by the achievement evaluator for lifetime metric checks.
   * Returns zeroes when the player has no stats rows yet.
   */
  async getLifetimeStats(discordId: string): Promise<{
    victorias:       number;
    partidasJugadas: number;
    mvpCount:        number;
  }> {
    const rows = await db
      .select({
        victorias:       sum(estadisticasTemporadaTable.victorias),
        partidasJugadas: sum(estadisticasTemporadaTable.partidasJugadas),
        mvpCount:        sum(estadisticasTemporadaTable.mvpCount),
      })
      .from(estadisticasTemporadaTable)
      .where(eq(estadisticasTemporadaTable.discordId, discordId));

    const row = rows[0];
    return {
      victorias:       Number(row?.victorias       ?? 0),
      partidasJugadas: Number(row?.partidasJugadas ?? 0),
      mvpCount:        Number(row?.mvpCount        ?? 0),
    };
  }
}

export const seasonRepository = new SeasonRepository();
