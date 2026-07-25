import {
  pgTable, serial, text, integer, timestamp, uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partidasTable } from "./partidas";

// ---------------------------------------------------------------------------
// reportes — player or staff reports
// ---------------------------------------------------------------------------
export const reportesTable = pgTable("reportes", {
  id:           uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reportanteId: text("reportante_id").notNull(),   // Discord ID of reporter
  reportadoId:  text("reportado_id").notNull(),    // Discord ID of reported user
  partidaId:    uuid("partida_id").references(() => partidasTable.id),
  motivo:       text("motivo").notNull(),
  descripcion:  text("descripcion"),
  status:       text("status").notNull().default("pending"),
  resueltoFor:  text("resuelto_por"),              // Discord ID of resolving staff
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// evidencias — file evidence attached to a report
// ---------------------------------------------------------------------------
export const evidenciasTable = pgTable("evidencias", {
  id:         serial("id").primaryKey(),
  reporteId:  uuid("reporte_id").notNull().references(() => reportesTable.id, { onDelete: "cascade" }),
  url:        text("url").notNull(),
  filename:   text("filename").notNull(),
  size:       integer("size").notNull(),      // bytes
  mimetype:   text("mimetype").notNull(),
  uploadedBy: text("uploaded_by").notNull(), // Discord ID
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReporteSchema    = createInsertSchema(reportesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const selectReporteSchema    = createSelectSchema(reportesTable);
export const insertEvidenciaSchema  = createInsertSchema(evidenciasTable).omit({ id: true, createdAt: true });
export const selectEvidenciaSchema  = createSelectSchema(evidenciasTable);

export type InsertReporte   = z.infer<typeof insertReporteSchema>;
export type Reporte         = typeof reportesTable.$inferSelect;
export type InsertEvidencia = z.infer<typeof insertEvidenciaSchema>;
export type Evidencia       = typeof evidenciasTable.$inferSelect;
