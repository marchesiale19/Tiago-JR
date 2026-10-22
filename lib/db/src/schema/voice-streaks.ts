
import {
  pgTable,
  integer,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const voiceStreaksTable = pgTable(
  "voice_streaks",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),

    // Días consecutivos de asistencia válida.
    currentStreak: integer("current_streak").notNull().default(0),

    // Mejor racha histórica.
    bestStreak: integer("best_streak").notNull().default(0),

    // Último día local cuya asistencia fue validada: YYYY-MM-DD.
    lastAttendanceDate: text("last_attendance_date"),

    // Última vez que se actualizó el registro.
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    guildUserUnique: unique().on(table.guildId, table.userId),
  }),
);

export type VoiceStreak = typeof voiceStreaksTable.$inferSelect;
export type NewVoiceStreak = typeof voiceStreaksTable.$inferInsert;
