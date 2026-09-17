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
  const guildId = "1437644356977823884"; // Tu ID de servidor para registro instantáneo
  logger.info({ count: body.length, guildId }, "Registering guild slash commands");

  // Cambiamos Routes.applicationCommands por Routes.applicationGuildCommands
  await rest.put(Routes.applicationGuildCommands(clientId as string, guildId), { body });

  logger.info("Guild slash commands registered successfully");
}

main().catch((err) => {
  logger.error({ err }, "Failed to register slash commands");
  process.exit(1);
});