
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
  "math_challenges",
  "missions",
  "mission_progress",
  "staff_help_requests",
  "staff_help_history",
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

  // Crear la tabla de retos matemáticos si todavía no existe.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS math_challenges (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id text NOT NULL,
      channel_id text NOT NULL,
      message_id text,
      user_id text NOT NULL,
      expression text NOT NULL,
      correct_answer integer NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      started_at timestamptz,
      expires_at timestamptz,
      answered_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS math_challenges_user_idx
    ON math_challenges (guild_id, user_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS math_challenges_status_idx
    ON math_challenges (status)
  `);

  logger.info("Math challenges table verified.");

  // Crear las tablas de misiones si todavía no existen.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR(20) NOT NULL,
      title VARCHAR(100) NOT NULL,
      reward INTEGER NOT NULL,
      action VARCHAR(30) NOT NULL,
      objective INTEGER NOT NULL,
      created_by VARCHAR(20) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      week_key VARCHAR(10) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS missions_guild_week_idx
    ON missions (guild_id, week_key, active)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS mission_progress (
      id SERIAL PRIMARY KEY,
      mission_id INTEGER NOT NULL
        REFERENCES missions(id) ON DELETE CASCADE,
      guild_id VARCHAR(20) NOT NULL,
      user_id VARCHAR(20) NOT NULL,
      progress_seconds INTEGER NOT NULL DEFAULT 0,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      paid BOOLEAN NOT NULL DEFAULT FALSE,
      session_started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS mission_progress_unique
    ON mission_progress (mission_id, guild_id, user_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS mission_progress_user_idx
    ON mission_progress (guild_id, user_id)
  `);

  logger.info("Mission tables verified.");

  // Crear las estructuras de Staff Help si todavía no existen.
  await db.execute(sql`
    DO $$
    BEGIN
      CREATE TYPE staff_help_status AS ENUM (
        'pending',
        'in_progress',
        'completed',
        'abandoned'
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
    $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS staff_help_requests (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      requester_id TEXT NOT NULL,
      request_message_id TEXT NOT NULL UNIQUE,
      claim_message_id TEXT,
      assignee_id TEXT,
      status staff_help_status NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      claimed_at TIMESTAMPTZ,
      last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS
      staff_help_active_requester_unique
    ON staff_help_requests (guild_id, requester_id)
    WHERE status IN ('pending', 'in_progress')
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS staff_help_status_activity_idx
    ON staff_help_requests (status, last_activity_at)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS staff_help_assignee_idx
    ON staff_help_requests (assignee_id)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS staff_help_history (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      request_id INTEGER NOT NULL
        REFERENCES staff_help_requests(id) ON DELETE CASCADE,
      actor_id TEXT,
      action TEXT NOT NULL,
      message_id TEXT,
      previous_assignee_id TEXT,
      new_assignee_id TEXT,
      details TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS staff_help_history_request_idx
    ON staff_help_history (request_id, created_at)
  `);

  logger.info("Staff Help tables verified.");

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
