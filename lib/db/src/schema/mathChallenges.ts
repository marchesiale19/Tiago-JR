import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const mathChallenges = pgTable(
  "math_challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id"),

    userId: text("user_id").notNull(),

    expression: text("expression").notNull(),
    correctAnswer: integer("correct_answer").notNull(),

    status: text("status")
      .$type<
        | "pending"
        | "active"
        | "completed"
        | "failed"
        | "expired"
        | "cancelled"
        | "refund_pending"
      >()
      .notNull()
      .default("pending"),

    startedAt: timestamp("started_at", {
      withTimezone: true,
    }),

    expiresAt: timestamp("expires_at", {
      withTimezone: true,
    }),

    answeredAt: timestamp("answered_at", {
      withTimezone: true,
    }),

    completedAt: timestamp("completed_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("math_challenges_user_idx").on(table.guildId, table.userId),
    index("math_challenges_status_idx").on(table.status),
  ],
);
