import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// auditoria — immutable audit trail for all staff actions
// ---------------------------------------------------------------------------
export const auditoriaTable = pgTable("auditoria", {
  id:               serial("id").primaryKey(),
  modulo:           text("modulo").notNull(),           // e.g. 'matchmaking', 'reports', 'elo'
  accion:           text("accion").notNull(),           // e.g. 'match_cancel', 'elo_revert'
  usuarioAfectado:  text("usuario_afectado"),           // Discord ID (nullable)
  realizadoPor:     text("realizado_por").notNull(),    // Discord ID of actor
  detalles:         jsonb("detalles"),                  // arbitrary extra context
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuditoriaSchema = createInsertSchema(auditoriaTable).omit({ id: true, createdAt: true });
export const selectAuditoriaSchema = createSelectSchema(auditoriaTable);
export type InsertAuditoria = z.infer<typeof insertAuditoriaSchema>;
export type Auditoria       = typeof auditoriaTable.$inferSelect;
