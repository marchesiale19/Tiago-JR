
import type { Client } from "discord.js";
import { logger } from "../lib/logger";

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
  "configuracion_competitiva",
  "supervisores_estado",
  "logros",
  "logros_jugador",
  "kakera_bank_transfers",
  "voice_streaks",
  "voice_streak_history",
  "voice_streak_rewards",
] as const;

export async function initDatabase(
  client?: Client,
): Promise<boolean> {
  if (!process.env["DATABASE_URL"]) {
    logger.warn(
      "DATABASE_URL not set — database layer is disabled for this session. " +
        "Provision a PostgreSQL database and set DATABASE_URL to enable it.",
    );
    return false;
  }

  logger.info("Initialising database connection…");

  const { sql } = await import("drizzle-orm");
  const { db } = await import("./database");

  try {
    await db.execute(sql`SELECT 1`);
    logger.info("Database connection OK.");
  } catch (err) {
    logger.error(
      { err },
      "Database connection failed — is DATABASE_URL correct?",
    );
    throw err;
  }

  const missingTables: string[] = [];

  for (const table of REQUIRED_TABLES) {
    try {
      const result = await db.execute<{ exists: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ${table}
        ) AS exists
      `);

      const exists = (result.rows[0] as any)?.exists ?? false;

      if (!exists) {
        missingTables.push(table);
      }
    } catch (err) {
      logger.warn(
        { err, table },
        "Could not check table existence.",
      );

      missingTables.push(table);
    }
  }

  if (missingTables.length > 0) {
    logger.warn(
      { missingTables },
      "Some tables are missing. Run:\n" +
        "  pnpm --filter @workspace/db run generate\n" +
        "  pnpm --filter @workspace/db run migrate",
    );

    return false;
  }

  logger.info(
    `All ${REQUIRED_TABLES.length} required tables are present.`,
  );

  try {
    const { seedLogros } = await import("./seedLogros");
    await seedLogros();
    logger.info("Achievement catalog seed completed.");
  } catch (err) {
    logger.error(
      { err },
      "Achievement catalog seed failed — continuing without seed.",
    );
  }

  if (client) {
    const { runRecovery } = await import("../services/RecoveryService");

    try {
      await runRecovery(client);
    } catch (err) {
      logger.error(
        { err },
        "Startup recovery failed — continuing without recovery.",
      );
    }
  }

  return true;
}
