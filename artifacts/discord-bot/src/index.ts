import { Client, Events, GatewayIntentBits } from "discord.js";
import { commands } from "./commands";
import { logger } from "./lib/logger";

const token = process.env["DISCORD_BOT_TOKEN"];

if (!token) {
  throw new Error("DISCORD_BOT_TOKEN environment variable is required.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
});

client.once(Events.ClientReady, (readyClient) => {
  logger.info({ tag: readyClient.user.tag }, "Discord bot logged in");
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    logger.warn(
      { commandName: interaction.commandName },
      "Received unknown command",
    );
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error(
      { err, commandName: interaction.commandName },
      "Error executing command",
    );
    const errorMessage = {
      content: "Hubo un error al ejecutar este comando.",
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

client.login(token).catch((err) => {
  logger.error({ err }, "Failed to log in to Discord");
  process.exit(1);
});
