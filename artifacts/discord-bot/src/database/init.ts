// ---------------------------------------------------------------------------
// init.ts — idempotent database initialisation called on bot startup.
//
// Responsibilities:
//   • Verify the connection is reachable.
//   • Confirm that all expected tables exist (fast sanity check).
//   • Log a clear error if the schema has not been pushed yet.
//
// This file does NOT drop or recreate tables. Schema changes are applied
// via `pnpm --filter @workspace/db run push` (drizzle-kit push) before
// deploying a new bot version.
// ---------------------------------------------------------------------------

import { sql } from "drizzle-orm";
import { db } from "./database";
import { logger } from "../lib/logger";
// Silence unused-import lint if drizzle-orm is only used via template literals

const REQUIRED_TABLES = [
  "usuarios",
  "temporadas",
  "lobbys",
  "participantes_lobby",
  "partidas",
  "participantes_partida",
  "historial_elo",
  "votos_mvp",
  "estadisticas_temporada",
  "reportes",
  "evidencias",
  "auditoria",
] as const;

export async function initDatabase(): Promise<void> {
  logger.info("Initialising database connection…");

  // 1. Connectivity check
  try {
    await db.execute(sql`SELECT 1`);
    logger.info("Database connection OK.");
  } catch (err) {
    logger.error({ err }, "Database connection failed. Is DATABASE_URL correct?");
    throw err;
  }

  // 2. Table presence check (informational — does not create anything)
  const missingTables: string[] = [];

  for (const table of REQUIRED_TABLES) {
    try {
      const result = await db.execute<{ exists: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name   = ${table}
        ) AS exists
      `);
      const exists = (result.rows[0] as any)?.exists ?? false;
      if (!exists) missingTables.push(table);
    } catch (err) {
      logger.warn({ err, table }, "Could not check table existence.");
    }
  }

  if (missingTables.length > 0) {
    logger.warn(
      { missingTables },
      "Some tables are missing. Run `pnpm --filter @workspace/db run push` to apply the schema.",
    );
  } else {
    logger.info("All required tables are present.");
  }
}
