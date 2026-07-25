import {
  pgTable, serial, text, integer, timestamp, uuid, unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { temporadasTable } from "./temporadas";

// ---------------------------------------------------------------------------
// lobbys — waiting rooms before a match starts
// cant_actual is derived: SELECT COUNT(*) FROM participantes_lobby WHERE lobby_id = ?
// ---------------------------------------------------------------------------
export const lobbysTable = pgTable("lobbys", {
  id:           uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  temporadaId:  integer("temporada_id").references(() => temporadasTable.id),
  creadorId:    text("creador_id").notNull(),   // Discord user ID
  channelId:    text("channel_id"),             // Discord channel snowflake
  status:       text("status").notNull().default("waiting"),
  maxJugadores: integer("max_jugadores").notNull().default(10),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// participantes_lobby — members currently waiting in a lobby
// ---------------------------------------------------------------------------
export const participantesLobbyTable = pgTable(
  "participantes_lobby",
  {
    id:        serial("id").primaryKey(),
    lobbyId:   uuid("lobby_id").notNull().references(() => lobbysTable.id, { onDelete: "cascade" }),
    discordId: text("discord_id").notNull(),
    joinedAt:  timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("uq_participante_lobby").on(t.lobbyId, t.discordId)],
);

export const insertLobbySchema               = createInsertSchema(lobbysTable).omit({ id: true, createdAt: true, updatedAt: true });
export const selectLobbySchema               = createSelectSchema(lobbysTable);
export const insertParticipanteLobbySchema   = createInsertSchema(participantesLobbyTable).omit({ id: true, joinedAt: true });
export const selectParticipanteLobbySchema   = createSelectSchema(participantesLobbyTable);

export type InsertLobby             = z.infer<typeof insertLobbySchema>;
export type Lobby                   = typeof lobbysTable.$inferSelect;
export type InsertParticipanteLobby = z.infer<typeof insertParticipanteLobbySchema>;
export type ParticipanteLobby       = typeof participantesLobbyTable.$inferSelect;
