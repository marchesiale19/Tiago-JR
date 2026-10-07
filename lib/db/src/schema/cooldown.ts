import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

export const cooldownsTable = pgTable(
  "cooldowns",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    command: text("command").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    guildUserCommandUnique: unique().on(
      table.guildId,
      table.userId,
      table.command
    ),
  })
);
Después agregá la exportación en tu schema/index.ts:

export * from "./usuarios";
export * from "./temporadas";
export * from "./lobbys";
export * from "./partidas";
export * from "./reportes";
export * from "./auditoria";
export * from "./competitivo";
export * from "./logros";
export * from "./reputaciones";
export * from "./cooldowns";
