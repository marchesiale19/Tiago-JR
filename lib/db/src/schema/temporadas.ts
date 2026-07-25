import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// temporadas — competitive seasons
// ---------------------------------------------------------------------------
export const temporadasTable = pgTable("temporadas", {
  id:          serial("id").primaryKey(),
  nombre:      text("nombre").notNull(),
  fechaInicio: timestamp("fecha_inicio", { withTimezone: true }).notNull(),
  fechaFin:    timestamp("fecha_fin",    { withTimezone: true }),
  activa:      boolean("activa").notNull().default(false),
  createdAt:   timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
});

export const insertTemporadaSchema = createInsertSchema(temporadasTable).omit({ id: true, createdAt: true });
export const selectTemporadaSchema = createSelectSchema(temporadasTable);
export type InsertTemporada = z.infer<typeof insertTemporadaSchema>;
export type Temporada       = typeof temporadasTable.$inferSelect;
