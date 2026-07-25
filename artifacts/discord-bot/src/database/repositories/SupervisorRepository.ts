// ---------------------------------------------------------------------------
// SupervisorRepository — CRUD for `supervisores_estado`.
// FIFO order: available && !ocupado ORDER BY ultimo_cambio ASC.
// ---------------------------------------------------------------------------

import { eq, and, asc, sql } from "drizzle-orm";
import { db } from "../database";
import {
  supervisoresEstadoTable,
  type InsertSupervisorEstado,
  type SupervisorEstado,
} from "@workspace/db";

export class SupervisorRepository {
  async findByDiscordId(discordId: string): Promise<SupervisorEstado | undefined> {
    const rows = await db
      .select()
      .from(supervisoresEstadoTable)
      .where(eq(supervisoresEstadoTable.discordId, discordId))
      .limit(1);
    return rows[0];
  }

  async upsert(data: InsertSupervisorEstado): Promise<SupervisorEstado> {
    const rows = await db
      .insert(supervisoresEstadoTable)
      .values(data)
      .onConflictDoUpdate({
        target: supervisoresEstadoTable.discordId,
        set: {
          disponible:   data.disponible,
          ocupado:      data.ocupado,
          ultimoCambio: sql`now()`,
        },
      })
      .returning();
    return rows[0]!;
  }

  /** Mark supervisor as available. Resets ocupado. Updates ultimoCambio (FIFO key). */
  async setDisponible(discordId: string, disponible: boolean): Promise<void> {
    await db
      .insert(supervisoresEstadoTable)
      .values({ discordId, disponible, ocupado: false })
      .onConflictDoUpdate({
        target: supervisoresEstadoTable.discordId,
        set: { disponible, ocupado: false, ultimoCambio: sql`now()` },
      });
  }

  /** Mark supervisor as occupied (busy with a match). Preserves disponible flag. */
  async setOcupado(discordId: string, ocupado: boolean): Promise<void> {
    await db
      .update(supervisoresEstadoTable)
      .set({ ocupado })
      .where(eq(supervisoresEstadoTable.discordId, discordId));
  }

  /** Return the next available supervisor by FIFO (ultimo_cambio ASC). */
  async findNextAvailable(): Promise<SupervisorEstado | undefined> {
    const rows = await db
      .select()
      .from(supervisoresEstadoTable)
      .where(
        and(
          eq(supervisoresEstadoTable.disponible, true),
          eq(supervisoresEstadoTable.ocupado,    false),
        ),
      )
      .orderBy(asc(supervisoresEstadoTable.ultimoCambio))
      .limit(1);
    return rows[0];
  }

  async listAll(): Promise<SupervisorEstado[]> {
    return db.select().from(supervisoresEstadoTable);
  }
}

export const supervisorRepository = new SupervisorRepository();
