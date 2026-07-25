import { pgTable, serial, text, integer, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// usuarios — registered players / Discord members
// ---------------------------------------------------------------------------
export const usuariosTable = pgTable("usuarios", {
  id:         serial("id").primaryKey(),
  discordId:  text("discord_id").notNull().unique(),
  username:   text("username").notNull(),
  elo:        integer("elo").notNull().default(1000),
  status:     text("status").notNull().default("active"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUsuarioSchema = createInsertSchema(usuariosTable).omit({ id: true, createdAt: true, updatedAt: true });
export const selectUsuarioSchema = createSelectSchema(usuariosTable);
export type InsertUsuario = z.infer<typeof insertUsuarioSchema>;
export type Usuario      = typeof usuariosTable.$inferSelect;
