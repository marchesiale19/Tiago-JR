import {
  pgTable,
  serial,
  text,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const reputacionesTable = pgTable(
  "reputaciones",
  {
    id: serial("id").primaryKey(),

    guildId: text("guild_id").notNull(),

    giverId: text("giver_id").notNull(),

    receiverId: text("receiver_id").notNull(),

    tipo: text("tipo").notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => ({
    receiverIdx: index("reputaciones_receiver_idx").on(
      table.guildId,
      table.receiverId
    ),

    giverReceiverIdx: index("reputaciones_giver_receiver_idx").on(
      table.guildId,
      table.giverId,
      table.receiverId
    ),

    tipoCheck: check(
      "reputaciones_tipo_check",
      sql`${table.tipo} IN ('positiva', 'negativa')`
    ),
  })
);

export type Reputacion = typeof reputacionesTable.$inferSelect;
export type InsertReputacion = typeof reputacionesTable.$inferInsert;
