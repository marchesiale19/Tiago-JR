// ---------------------------------------------------------------------------
// UserRepository — CRUD for the `usuarios` table.
// No business logic. No ELO calculation. Persistence only.
// ---------------------------------------------------------------------------

import { eq, desc, sql } from "drizzle-orm";
import { db } from "../database";
import {
  usuariosTable,
  type InsertUsuario,
  type Usuario,
} from "@workspace/db";
import { type UserStatus } from "../enums";

export class UserRepository {
  /** Find a user by their Discord snowflake ID. Returns undefined if not found. */
  async findByDiscordId(discordId: string): Promise<Usuario | undefined> {
    const rows = await db
      .select()
      .from(usuariosTable)
      .where(eq(usuariosTable.discordId, discordId))
      .limit(1);
    return rows[0];
  }

  /** Find a user by their internal serial PK. */
  async findById(id: number): Promise<Usuario | undefined> {
    const rows = await db
      .select()
      .from(usuariosTable)
      .where(eq(usuariosTable.id, id))
      .limit(1);
    return rows[0];
  }

  /** Insert a new user. Throws on duplicate discord_id. */
  async create(data: InsertUsuario): Promise<Usuario> {
    const rows = await db
      .insert(usuariosTable)
      .values(data)
      .returning();
    return rows[0]!;
  }

  /**
   * Upsert: insert if the discord_id is new, otherwise update username.
   * Safe to call on every interaction — idempotent.
   */
  async upsert(data: InsertUsuario): Promise<Usuario> {
    const rows = await db
      .insert(usuariosTable)
      .values(data)
      .onConflictDoUpdate({
        target: usuariosTable.discordId,
        set: {
          username:  data.username,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    return rows[0]!;
  }

  /** Update ELO for a user. */
  async updateElo(discordId: string, newElo: number): Promise<void> {
    await db
      .update(usuariosTable)
      .set({ elo: newElo, updatedAt: sql`now()` })
      .where(eq(usuariosTable.discordId, discordId));
  }

  /** Update status (active / suspended / banned). */
  async updateStatus(discordId: string, status: UserStatus): Promise<void> {
    await db
      .update(usuariosTable)
      .set({ status, updatedAt: sql`now()` })
      .where(eq(usuariosTable.discordId, discordId));
  }

  /** List all users ordered by ELO descending (global leaderboard). */
  async listByEloDesc(limit = 50): Promise<Usuario[]> {
    return db
      .select()
      .from(usuariosTable)
      .orderBy(desc(usuariosTable.elo))
      .limit(limit);
  }
}

export const userRepository = new UserRepository();
