// ---------------------------------------------------------------------------
// AuditoriaRepository — append-only writes to the `auditoria` table.
// Records are immutable: no update or delete methods are provided.
// ---------------------------------------------------------------------------

import { eq, desc } from "drizzle-orm";
import { db } from "../database";
import {
  auditoriaTable,
  type InsertAuditoria,
  type Auditoria,
} from "@workspace/db";
import { type AuditModulo } from "../enums";

export class AuditoriaRepository {
  /** Append a new audit entry. */
  async log(data: InsertAuditoria): Promise<Auditoria> {
    const rows = await db.insert(auditoriaTable).values(data).returning();
    return rows[0]!;
  }

  /** Retrieve recent audit entries for a specific affected user. */
  async listByUsuarioAfectado(
    discordId: string,
    limit = 50,
  ): Promise<Auditoria[]> {
    return db
      .select()
      .from(auditoriaTable)
      .where(eq(auditoriaTable.usuarioAfectado, discordId))
      .orderBy(desc(auditoriaTable.createdAt))
      .limit(limit);
  }

  /** Retrieve recent audit entries for a specific module. */
  async listByModulo(
    modulo: AuditModulo,
    limit = 50,
  ): Promise<Auditoria[]> {
    return db
      .select()
      .from(auditoriaTable)
      .where(eq(auditoriaTable.modulo, modulo))
      .orderBy(desc(auditoriaTable.createdAt))
      .limit(limit);
  }
}

export const auditoriaRepository = new AuditoriaRepository();
