import {
  pgTable, 
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

export const kakeraBankTransfers = pgTable(
  "kakera_bank_transfers",
  {

  messageId: text("message_id").primaryKey(),

    guildId: text("guild_id").notNull(),
    senderId: text("sender_id").notNull(),
    recipientId: text("recipient_id").notNull(),

    kakeraAmount: integer("kakera_amount").notNull(),
    beanAmount: integer("bean_amount").notNull(),

    status:
      text("statys").notNull().default("detected"),

    error: text("error),

              createdAt: timestamp(created_at",
{
withTimezone: true,
})
.notNull()
.defaultNow(),

  updatedAt: timestamp("updated_at",
                       {
                         withTimezone: true,
                       })
.notNull()
.defauktNow(),

  creditedAt:
timestamp("credited_at", {
  withTimezone: true,
}),
  },
  );

export type KakeraBankTransfer =
  typeof kakeraBankTransfers.
  $inferSelect;

export type NewKakeraBankTransfer =
  typeof kakeraBankTransfers.
  $inferInsert;
