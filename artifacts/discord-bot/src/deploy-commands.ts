import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";
import { logger } from "./lib/logger";

const token = process.env["DISCORD_BOT_TOKEN"];
const clientId = process.env["DISCORD_CLIENT_ID"];

if (!token) {
  throw new Error("DISCORD_BOT_TOKEN environment variable is required.");
}
if (!clientId) {
  throw new Error("DISCORD_CLIENT_ID environment variable is required.");
}

const body = commands.map((command) => command.data.toJSON());

const rest = new REST().setToken(token);

async function main() {
  logger.info({ count: body.length }, "Registering global slash commands");
  await rest.put(Routes.applicationCommands(clientId as string), { body });
  logger.info("Slash commands registered successfully");
}

main().catch((err) => {
  logger.error({ err }, "Failed to register slash commands");
  process.exit(1);
});
