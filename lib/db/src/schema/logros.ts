import {
  pgTable, serial, text, integer, boolean, timestamp, jsonb, unique, index,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// logros — achievement catalog (definitions, never player-specific)
// ---------------------------------------------------------------------------
export const logrosTable = pgTable("logros", {
  id:          serial("id").primaryKey(),
  codigo:      text("codigo").notNull().unique(),          // e.g. "VICTORIAS_100"
  nombre:      text("nombre").notNull(),
  descripcion: text("descripcion").notNull(),
  tipo:        text("tipo").notNull(),                     // e.g. "VICTORIAS" | "PARTIDAS" | "MVP"
  valor:       integer("valor").notNull(),                 // threshold value, e.g. 100
  activo:      boolean("activo").notNull().default(true),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// logros_jugador — player unlock records (one row per player per achievement)
// ---------------------------------------------------------------------------
export const logrosJugadorTable = pgTable(
  "logros_jugador",
  {
    id:          serial("id").primaryKey(),
    discordId:   text("discord_id").notNull(),
    logroId:     integer("logro_id").notNull().references(() => logrosTable.id, { onDelete: "cascade" }),
    obtenidoAt:  timestamp("obtenido_at", { withTimezone: true }).notNull().defaultNow(),
    metadata:    jsonb("metadata"),                        // optional context (season, match id, etc.)
  },
  (t) => [
    unique("uq_logro_jugador").on(t.discordId, t.logroId),
    index("idx_logros_jugador_discord_id").on(t.discordId),
  ],
);

// Schemas & types
export const insertLogroSchema        = createInsertSchema(logrosTable).omit({ id: true, createdAt: true });
export const selectLogroSchema        = createSelectSchema(logrosTable);
export const insertLogroJugadorSchema = createInsertSchema(logrosJugadorTable).omit({ id: true, obtenidoAt: true });
export const selectLogroJugadorSchema = createSelectSchema(logrosJugadorTable);

export type InsertLogro        = z.infer<typeof insertLogroSchema>;
export type Logro              = typeof logrosTable.$inferSelect;
export type InsertLogroJugador = z.infer<typeof insertLogroJugadorSchema>;
export type LogroJugador       = typeof logrosJugadorTable.$inferSelect;
