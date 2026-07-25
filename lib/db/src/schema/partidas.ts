import {
  pgTable, serial, text, integer, timestamp, uuid, check, unique, index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lobbysTable } from "./lobbys";
import { temporadasTable } from "./temporadas";

// ---------------------------------------------------------------------------
// partidas — individual matches
// ---------------------------------------------------------------------------
export const partidasTable = pgTable("partidas", {
  id:            uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  lobbyId:       uuid("lobby_id").references(() => lobbysTable.id),
  temporadaId:   integer("temporada_id").references(() => temporadasTable.id),
  status:        text("status").notNull().default("in_progress"),
  ganadorEquipo: integer("ganador_equipo"),          // 1 | 2 | NULL (draw / cancelled)
  createdAt:     timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
  finishedAt:    timestamp("finished_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// participantes_partida — players inside a running match
// ---------------------------------------------------------------------------
export const participantesPartidaTable = pgTable("participantes_partida", {
  id:        serial("id").primaryKey(),
  partidaId: uuid("partida_id").notNull().references(() => partidasTable.id, { onDelete: "cascade" }),
  discordId: text("discord_id").notNull(),
  equipo:    integer("equipo").notNull(),   // 1 | 2
  status:    text("status").notNull().default("playing"),
  rol:       text("rol"),                  // 'impostor' | 'tripulante' | null
});

// ---------------------------------------------------------------------------
// historial_elo — every ELO change event for a player
// ---------------------------------------------------------------------------
export const historialEloTable = pgTable("historial_elo", {
  id:          serial("id").primaryKey(),
  discordId:   text("discord_id").notNull(),
  partidaId:   uuid("partida_id").references(() => partidasTable.id),
  temporadaId: integer("temporada_id").references(() => temporadasTable.id),
  eloAnterior: integer("elo_anterior").notNull(),
  eloNuevo:    integer("elo_nuevo").notNull(),
  // motivo values: 'victory' | 'defeat' | 'abandon' | 'expulsion' | 'staff_reversion' | 'season_reset'
  motivo:      text("motivo").notNull(),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// votos_mvp — one vote per player per match; cannot vote for yourself
// ---------------------------------------------------------------------------
export const votosMvpTable = pgTable(
  "votos_mvp",
  {
    id:        serial("id").primaryKey(),
    partidaId: uuid("partida_id").notNull().references(() => partidasTable.id, { onDelete: "cascade" }),
    votanteId: text("votante_id").notNull(),
    votadoId:  text("votado_id").notNull(),
  },
  (t) => [
    check("chk_no_self_vote", sql`${t.votanteId} != ${t.votadoId}`),
    index("idx_votos_mvp_partida_id").on(t.partidaId),
  ],
);

// ---------------------------------------------------------------------------
// estadisticas_temporada — aggregated per-season stats (no derived winrate stored)
// ---------------------------------------------------------------------------
export const estadisticasTemporadaTable = pgTable(
  "estadisticas_temporada",
  {
    id:             serial("id").primaryKey(),
    discordId:      text("discord_id").notNull(),
    temporadaId:    integer("temporada_id").notNull().references(() => temporadasTable.id),
    partidasJugadas: integer("partidas_jugadas").notNull().default(0),
    victorias:      integer("victorias").notNull().default(0),
    derrotas:       integer("derrotas").notNull().default(0),
    abandonos:      integer("abandonos").notNull().default(0),
    elo:            integer("elo").notNull().default(1000),
    mvpCount:       integer("mvp_count").notNull().default(0),
  },
  (t) => [
    unique("uq_estadisticas_temporada").on(t.discordId, t.temporadaId),
    index("idx_estadisticas_temporada_season_elo").on(t.temporadaId, t.elo),
  ],
);

// Schemas & types
export const insertPartidaSchema               = createInsertSchema(partidasTable).omit({ id: true, createdAt: true });
export const selectPartidaSchema               = createSelectSchema(partidasTable);
export const insertParticipantePartidaSchema   = createInsertSchema(participantesPartidaTable).omit({ id: true });
export const selectParticipantePartidaSchema   = createSelectSchema(participantesPartidaTable);
export const insertHistorialEloSchema          = createInsertSchema(historialEloTable).omit({ id: true, createdAt: true });
export const selectHistorialEloSchema          = createSelectSchema(historialEloTable);
export const insertVotoMvpSchema               = createInsertSchema(votosMvpTable).omit({ id: true });
export const selectVotoMvpSchema               = createSelectSchema(votosMvpTable);
export const insertEstadisticaTemporadaSchema  = createInsertSchema(estadisticasTemporadaTable).omit({ id: true });
export const selectEstadisticaTemporadaSchema  = createSelectSchema(estadisticasTemporadaTable);

export type InsertPartida              = z.infer<typeof insertPartidaSchema>;
export type Partida                    = typeof partidasTable.$inferSelect;
export type InsertParticipantePartida  = z.infer<typeof insertParticipantePartidaSchema>;
export type ParticipantePartida        = typeof participantesPartidaTable.$inferSelect;
export type InsertHistorialElo         = z.infer<typeof insertHistorialEloSchema>;
export type HistorialElo               = typeof historialEloTable.$inferSelect;
export type InsertVotoMvp              = z.infer<typeof insertVotoMvpSchema>;
export type VotoMvp                    = typeof votosMvpTable.$inferSelect;
export type InsertEstadisticaTemporada = z.infer<typeof insertEstadisticaTemporadaSchema>;
export type EstadisticaTemporada       = typeof estadisticasTemporadaTable.$inferSelect;
