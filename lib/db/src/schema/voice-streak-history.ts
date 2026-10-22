
import {
  pgTable,
  integer,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const voiceStreakHistoryTable = pgTable(
  "voice_streak_history",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),

    // Día local de la asistencia: YYYY-MM-DD.
    attendanceDate: text("attendance_date").notNull(),

    // Momento en que se confirmó la asistencia.
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uniqueDailyAttendance: unique().on(
      table.guildId,
      table.userId,
      table.attendanceDate,
    ),
  }),
);

export type VoiceStreakHistory =
  typeof voiceStreakHistoryTable.$inferSelect;

export type NewVoiceStreakHistory =
  typeof voiceStreakHistoryTable.$inferInsert;
