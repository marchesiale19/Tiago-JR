
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const missions = pgTable(
  "missions",
  {
    id: serial("id").primaryKey(),
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    title: varchar("title", { length: 100 }).notNull(),
    reward: integer("reward").notNull(),
    action: varchar("action", { length: 30 }).notNull(),
    objective: integer("objective").notNull(),

    createdBy: varchar("created_by", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),

    weekKey: varchar("week_key", { length: 10 }).notNull(),
    active: boolean("active").default(true).notNull(),
  },
  (table) => [
    index("missions_guild_week_idx").on(
      table.guildId,
      table.weekKey,
      table.active,
    ),
  ],
);

export const missionProgress = pgTable(
  "mission_progress",
  {
    id: serial("id").primaryKey(),
    missionId: integer("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),

    guildId: varchar("guild_id", { length: 20 }).notNull(),
    userId: varchar("user_id", { length: 20 }).notNull(),

    progressSeconds: integer("progress_seconds")
      .default(0)
      .notNull(),

    completed: boolean("completed").default(false).notNull(),
    paid: boolean("paid").default(false).notNull(),

    // Intervalo de voz actualmente válido.
    sessionStartedAt: timestamp("session_started_at", {
      withTimezone: true,
    }),

    completedAt: timestamp("completed_at", {
      withTimezone: true,
    }),
    paidAt: timestamp("paid_at", {
      withTimezone: true,
    }),
  },
  (table) => [
    uniqueIndex("mission_progress_unique").on(
      table.missionId,
      table.guildId,
      table.userId,
    ),
    index("mission_progress_user_idx").on(
      table.guildId,
      table.userId,
    ),
  ],
);
