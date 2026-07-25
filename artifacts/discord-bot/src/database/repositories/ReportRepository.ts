// ---------------------------------------------------------------------------
// ReportRepository — CRUD for `reportes` and `evidencias`.
// ---------------------------------------------------------------------------

import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../database";
import {
  reportesTable,
  evidenciasTable,
  type InsertReporte,
  type Reporte,
  type InsertEvidencia,
  type Evidencia,
} from "@workspace/db";
import { type ReportStatus } from "../enums";

export class ReportRepository {
  // ── Reportes ──────────────────────────────────────────────────────────────

  async findById(id: string): Promise<Reporte | undefined> {
    const rows = await db
      .select()
      .from(reportesTable)
      .where(eq(reportesTable.id, id))
      .limit(1);
    return rows[0];
  }

  async create(data: InsertReporte): Promise<Reporte> {
    const rows = await db.insert(reportesTable).values(data).returning();
    return rows[0]!;
  }

  async updateStatus(
    id: string,
    status: ReportStatus,
    resueltoFor?: string,
  ): Promise<void> {
    await db
      .update(reportesTable)
      .set({ status, resueltoFor: resueltoFor ?? null, updatedAt: sql`now()` })
      .where(eq(reportesTable.id, id));
  }

  /** List reports filtered by status, newest first. */
  async listByStatus(status: ReportStatus, limit = 50): Promise<Reporte[]> {
    return db
      .select()
      .from(reportesTable)
      .where(eq(reportesTable.status, status))
      .orderBy(desc(reportesTable.createdAt))
      .limit(limit);
  }

  /** List reports filed against a specific user, newest first. */
  async listByReportado(discordId: string, limit = 50): Promise<Reporte[]> {
    return db
      .select()
      .from(reportesTable)
      .where(eq(reportesTable.reportadoId, discordId))
      .orderBy(desc(reportesTable.createdAt))
      .limit(limit);
  }

  // ── Evidencias ────────────────────────────────────────────────────────────

  async addEvidencia(data: InsertEvidencia): Promise<Evidencia> {
    const rows = await db.insert(evidenciasTable).values(data).returning();
    return rows[0]!;
  }

  async listEvidencias(reporteId: string): Promise<Evidencia[]> {
    return db
      .select()
      .from(evidenciasTable)
      .where(eq(evidenciasTable.reporteId, reporteId));
  }

  async deleteEvidencia(id: number): Promise<void> {
    await db.delete(evidenciasTable).where(eq(evidenciasTable.id, id));
  }
}

export const reportRepository = new ReportRepository();
