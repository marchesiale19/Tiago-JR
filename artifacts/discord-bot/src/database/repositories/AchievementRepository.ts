// ---------------------------------------------------------------------------
// AchievementRepository — CRUD for `logros` and `logros_jugador`.
// No achievement evaluation logic lives here — only persistence.
// ---------------------------------------------------------------------------

import { eq, sql } from "drizzle-orm";
import { db } from "../database";
import {
  logrosTable,
  logrosJugadorTable,
  type InsertLogroJugador,
  type Logro,
  type LogroJugador,
} from "@workspace/db";

export class AchievementRepository {
  // ── Catalog ───────────────────────────────────────────────────────────────

  /** Return all active achievements from the catalog. */
  async listActive(): Promise<Logro[]> {
    return db
      .select()
      .from(logrosTable)
      .where(eq(logrosTable.activo, true));
  }

  // ── Player unlocks ────────────────────────────────────────────────────────

  /** Return all achievements unlocked by a specific player. */
  async listByPlayer(discordId: string): Promise<LogroJugador[]> {
    return db
      .select()
      .from(logrosJugadorTable)
      .where(eq(logrosJugadorTable.discordId, discordId));
  }

  /**
   * Record an achievement unlock for a player.
   * Idempotent — silently ignores duplicate unlocks (same discordId + logroId).
   * Returns the existing or newly created row.
   */
  async unlock(data: InsertLogroJugador): Promise<LogroJugador> {
    const rows = await db
      .insert(logrosJugadorTable)
      .values(data)
      .onConflictDoNothing({
        target: [logrosJugadorTable.discordId, logrosJugadorTable.logroId],
      })
      .returning();

    if (rows.length > 0) return rows[0]!;

    // Row already existed — return the existing record
    const existing = await db
      .select()
      .from(logrosJugadorTable)
      .where(
        sql`${logrosJugadorTable.discordId} = ${data.discordId}
        AND ${logrosJugadorTable.logroId}   = ${data.logroId}`,
      )
      .limit(1);

    return existing[0]!;
  }
}

export const achievementRepository = new AchievementRepository();
