import {
  pgTable, serial, text, boolean, timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// configuracion_competitiva — key/value store for system parameters.
// Business logic reads these at runtime so values can change without redeploy.
// ---------------------------------------------------------------------------
export const configuracionCompetitivaTable = pgTable("configuracion_competitiva", {
  id:          serial("id").primaryKey(),
  clave:       text("clave").notNull().unique(),
  valor:       text("valor").notNull(),
  descripcion: text("descripcion"),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// supervisores_estado — availability tracking for supervisors.
// FIFO assignment uses ultimo_cambio ASC (set when disponible changes).
// ---------------------------------------------------------------------------
export const supervisoresEstadoTable = pgTable("supervisores_estado", {
  id:           serial("id").primaryKey(),
  discordId:    text("discord_id").notNull().unique(),
  disponible:   boolean("disponible").notNull().default(false),
  ocupado:      boolean("ocupado").notNull().default(false),
  ultimoCambio: timestamp("ultimo_cambio", { withTimezone: true }).notNull().defaultNow(),
});

export const insertConfigSchema    = createInsertSchema(configuracionCompetitivaTable).omit({ id: true, updatedAt: true });
export const selectConfigSchema    = createSelectSchema(configuracionCompetitivaTable);
export const insertSupervisorEstadoSchema = createInsertSchema(supervisoresEstadoTable).omit({ id: true });
export const selectSupervisorEstadoSchema = createSelectSchema(supervisoresEstadoTable);

export type InsertConfig           = z.infer<typeof insertConfigSchema>;
export type Config                 = typeof configuracionCompetitivaTable.$inferSelect;
export type InsertSupervisorEstado = z.infer<typeof insertSupervisorEstadoSchema>;
export type SupervisorEstado       = typeof supervisoresEstadoTable.$inferSelect;
