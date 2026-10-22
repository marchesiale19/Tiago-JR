
import {
  integer,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { pgTable } from "drizzle-orm/pg-core";

export const voiceStreakRewardsTable = pgTable(
  "voice_streak_rewards",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),

    // Número de la racha a la que pertenece el premio.
    cycleNumber: integer("cycle_number").notNull(),

    // Hito alcanzado: 10, 20, 30 días, etc.
    milestone: integer("milestone").notNull(),

    // Estado del pago para evitar procesar el mismo premio normalmente más de una vez.
    status: text("status").notNull().default("pending"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    paidAt: timestamp("paid_at", {
      withTimezone: true,
    }),
  },
  (table) => ({
    uniqueMilestoneReward: unique().on(
      table.guildId,
      table.userId,
      table.cycleNumber,
      table.milestone,
    ),
  }),
);

export type VoiceStreakReward =
  typeof voiceStreakRewardsTable.$inferSelect;

export type NewVoiceStreakReward =
  typeof voiceStreakRewardsTable.$inferInsert;
