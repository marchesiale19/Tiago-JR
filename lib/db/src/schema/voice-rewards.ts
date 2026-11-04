
import {
  pgTable,
  text,
  integer,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const voiceRewardsTable = pgTable(
  "voice_rewards",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),

    // Segundos acumulados que todavía no completan una hora.
    accumulatedSeconds: integer("accumulated_seconds")
      .notNull()
      .default(0),

    // Tiempo acumulado para el próximo resumen privado.
    summarySeconds: integer("summary_seconds")
      .notNull()
      .default(0),

    // Dinero ganado desde el último resumen enviado.
    summaryEarned: integer("summary_earned")
      .notNull()
      .default(0),

    // Momento desde el que se está contando la sesión actual.
    sessionStartedAt: timestamp("session_started_at", {
      withTimezone: true,
    }),

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

export type VoiceReward = typeof voiceRewardsTable.$inferSelect;
export type NewVoiceReward = typeof voiceRewardsTable.$inferInsert;
