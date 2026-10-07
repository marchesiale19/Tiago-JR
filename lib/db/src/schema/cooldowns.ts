import {
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const cooldownsTable = pgTable(
  "collect_cooldowns",
  {
    id: serial("id").primaryKey(),

    guildId: text("guild_id").notNull(),

    userId: text("user_id").notNull(),

    lastCollect: timestamp("last_collect", {
      withTimezone: true,
    }).notNull(),
  },
  (table) => ({
    guildUserUnique: unique().on(
      table.guildId,
      table.userId,
    ),
  }),
);

export type CollectCooldown =
  typeof cooldownsTable.$inferSelect;

export type NewCollectCooldown =
  typeof cooldownsTable.$inferInsert;
