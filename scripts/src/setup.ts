/**
 * Setup script for the Discord bot project.
 *
 * Runs after `pnpm install` to:
 *   1. Push the Drizzle ORM schema to the PostgreSQL database
 *   2. Register all slash commands with Discord globally
 *
 * Usage:
 *   pnpm run setup
 *
 * Required environment variables:
 *   DATABASE_URL       — PostgreSQL connection string (auto-provided by Replit)
 *   DISCORD_BOT_TOKEN  — Bot token from the Discord Developer Portal
 *   DISCORD_CLIENT_ID  — Application ID from the Discord Developer Portal
 */

import { execSync } from "node:child_process";

function run(label: string, cmd: string) {
  console.log(`\n▶ ${label}`);
  execSync(cmd, { stdio: "inherit", cwd: new URL("../../", import.meta.url).pathname });
  console.log(`✓ ${label} done`);
}

const missingVars = ["DATABASE_URL", "DISCORD_BOT_TOKEN", "DISCORD_CLIENT_ID"].filter(
  (k) => !process.env[k],
);

if (missingVars.length > 0) {
  console.error(`\nMissing required environment variables: ${missingVars.join(", ")}`);
  console.error("Set them as Replit Secrets before running setup.\n");
  process.exit(1);
}

run("Push database schema", "pnpm --filter @workspace/db run push");
run("Deploy slash commands to Discord", "pnpm --filter @workspace/discord-bot run deploy-commands");

console.log("\n✅ Setup complete. Start the bot with the Discord Bot workflow.\n");
