// ---------------------------------------------------------------------------
// database.ts — re-exports the shared Drizzle db instance from @workspace/db.
// Import `db` from here throughout the discord-bot, not directly from lib/db,
// so the connection point stays a single place to swap if needed.
// ---------------------------------------------------------------------------

export { db, pool } from "@workspace/db";
export * from "@workspace/db";
