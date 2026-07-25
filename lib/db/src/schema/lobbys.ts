import {
  pgTable, serial, text, integer, timestamp, uuid, unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { temporadasTable } from "./temporadas";

// ---------------------------------------------------------------------------
// lobbys — Phase 2 state machine:
//   QUEUE → WAITING_SUPERVISOR → READY → IN_GAME → VALIDATING → CLOSED
//                                                              ↘ CANCELLED (from any state)
//
// One lobby may be in QUEUE state at a time (enforced by service layer +
// partial unique index as a DB-level backstop).
// cant_actual is always derived: COUNT(*) FROM participantes_lobby WHERE lobby_id = ?
// ---------------------------------------------------------------------------
export const lobbysTable = pgTable(
  "lobbys",
  {
    id:                   uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    temporadaId:          integer("temporada_id").references(() => temporadasTable.id),
    creadorId:            text("creador_id").notNull(),      // Discord user ID
    channelId:            text("channel_id"),                // originating text channel
    status:               text("status").notNull().default("queue"),
    maxJugadores:         integer("max_jugadores").notNull().default(10),
    // Supervisor assignment
    supervisorId:         text("supervisor_id"),             // Discord ID of assigned supervisor
    supervisorNotifiedAt: timestamp("supervisor_notified_at", { withTimezone: true }),
    // Discord channels created on READY
    textChannelId:        text("text_channel_id"),
    voiceChannelId:       text("voice_channel_id"),
    // Recovery flag
    guildId:              text("guild_id"),                  // stored so recovery can target correct guild
    createdAt:            timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
    updatedAt:            timestamp("updated_at",  { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // DB-level backstop: at most one QUEUE lobby at any moment.
    // The service layer checks first; this index catches any race condition.
    uniqueIndex("uq_single_queue_lobby").on(t.status).where(sql`status = 'queue'`),
  ],
);

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
