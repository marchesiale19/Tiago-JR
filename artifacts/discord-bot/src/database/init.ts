// ---------------------------------------------------------------------------
// init.ts — idempotent database initialisation called on bot startup.
//
// Responsibilities:
//   • Skip cleanly if DATABASE_URL is not configured (optional during development).
//   • Verify the connection is reachable.
//   • Confirm that all expected tables exist (informational; never creates them).
//   • Kick off startup recovery (orphan cleanup, crash flagging).
//
// Schema changes are applied via:
//   pnpm --filter @workspace/db run generate   (create migration file)
//   pnpm --filter @workspace/db run migrate    (apply to database)
// ---------------------------------------------------------------------------

import type { Client } from "discord.js";
import { logger } from "../lib/logger";

const REQUIRED_TABLES = [
  // Phase 1
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
  // Phase 2
  "configuracion_competitiva",
  "supervisores_estado",
] as const;

export async function initDatabase(client?: Client): Promise<void> {
  if (!process.env["DATABASE_URL"]) {
    logger.warn(
      "DATABASE_URL not set — database layer is disabled for this session. " +
      "Provision a PostgreSQL database and set DATABASE_URL to enable it.",
    );
    return;
  }

  logger.info("Initialising database connection…");

  const { sql } = await import("drizzle-orm");
  const { db }  = await import("./database");

  // 1. Connectivity check
  try {
    await db.execute(sql`SELECT 1`);
    logger.info("Database connection OK.");
  } catch (err) {
    logger.error({ err }, "Database connection failed — is DATABASE_URL correct?");
    throw err;
  }

  // 2. Table presence check
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
      "Some tables are missing. Run:\n" +
      "  pnpm --filter @workspace/db run generate\n" +
      "  pnpm --filter @workspace/db run migrate",
    );
    // Cannot run recovery without complete schema
    return;
  }

  logger.info(`All ${REQUIRED_TABLES.length} required tables are present.`);

  // 3. Startup recovery (requires Discord client for channel cleanup)
  if (client) {
    const { runRecovery } = await import("../services/RecoveryService");
    try {
      await runRecovery(client);
    } catch (err) {
      logger.error({ err }, "Startup recovery failed — continuing without recovery");
    }
  }
}
