// ---------------------------------------------------------------------------
// ConfigRepository — CRUD for `configuracion_competitiva`.
// ---------------------------------------------------------------------------

import { eq, sql } from "drizzle-orm";
import { db } from "../database";
import {
  configuracionCompetitivaTable,
  type InsertConfig,
  type Config,
} from "@workspace/db";

export class ConfigRepository {
  async findByKey(clave: string): Promise<Config | undefined> {
    const rows = await db
      .select()
      .from(configuracionCompetitivaTable)
      .where(eq(configuracionCompetitivaTable.clave, clave))
      .limit(1);
    return rows[0];
  }

  async getAll(): Promise<Config[]> {
    return db.select().from(configuracionCompetitivaTable);
  }

  /** Insert or overwrite a key. */
  async upsert(data: InsertConfig): Promise<Config> {
    const rows = await db
      .insert(configuracionCompetitivaTable)
      .values(data)
      .onConflictDoUpdate({
        target: configuracionCompetitivaTable.clave,
        set: { valor: data.valor, updatedAt: sql`now()` },
      })
      .returning();
    return rows[0]!;
  }

  /** Seed defaults without overwriting existing entries. */
  async seedDefaults(defaults: InsertConfig[]): Promise<void> {
    await db
      .insert(configuracionCompetitivaTable)
      .values(defaults)
      .onConflictDoNothing();
  }
}

export const configRepository = new ConfigRepository();
