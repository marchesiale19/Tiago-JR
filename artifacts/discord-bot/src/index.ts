import {
  Client,
  Events,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
} from "discord.js";
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

async function handlePostulationDecision(
  interaction: ButtonInteraction,
): Promise<void> {
  const match = interaction.customId.match(
    /^postular_(approve|reject)_(\d+)$/,
  );
  if (!match) return;

  const [, decision, applicantId] = match;

  const member = interaction.member;
  const hasPermission =
    member &&
    "permissions" in member &&
    typeof member.permissions !== "string" &&
    (member.permissions as Readonly<PermissionsBitField>).has(
      PermissionsBitField.Flags.ManageRoles,
    );

  if (!hasPermission) {
    await interaction.reply({
      content: "No tienes permiso para revisar postulaciones.",
      ephemeral: true,
    });
    return;
  }

  const originalEmbed = interaction.message.embeds[0];
  const approved = decision === "approve";

  const updatedEmbed = originalEmbed
    ? EmbedBuilder.from(originalEmbed)
        .setColor(approved ? "Green" : "Red")
        .setTitle(
          approved ? "✅ Postulación APROBADA" : "❌ Postulación RECHAZADA",
        )
        .setFooter({
          text: `${approved ? "Aprobada" : "Rechazada"} por ${interaction.user.username}`,
        })
    : null;

  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("postular_approve_disabled")
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("postular_reject_disabled")
      .setLabel("Reject")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true),
  );

  try {
    await interaction.update({
      embeds: updatedEmbed ? [updatedEmbed] : undefined,
      components: [disabledRow],
    });
  } catch (err) {
    logger.warn({ err }, "Failed to update application message");
  }

  try {
    const applicant = await interaction.client.users.fetch(applicantId ?? "");
    await applicant.send(
      approved
        ? "✅ Tu postulación fue APROBADA."
        : "❌ Tu postulación fue RECHAZADA.",
    );
  } catch (err) {
    logger.info(
      { err, applicantId },
      "Could not DM applicant about decision",
    );
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith("postular_")) {
      try {
        await handlePostulationDecision(interaction);
      } catch (err) {
        logger.error({ err }, "Error handling postulation decision button");
      }
    }
    return;
  }

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
