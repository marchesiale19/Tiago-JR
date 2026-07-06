import {
  Client,
  Events,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
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

const REJECT_REASON_INPUT_ID = "postular_reject_reason";

function formatActionTimestamp(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function hasReviewPermission(
  member: ButtonInteraction["member"] | ModalSubmitInteraction["member"],
): boolean {
  return Boolean(
    member &&
      "permissions" in member &&
      typeof member.permissions !== "string" &&
      (member.permissions as Readonly<PermissionsBitField>).has(
        PermissionsBitField.Flags.ManageRoles,
      ),
  );
}

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

async function handleApprove(
  interaction: ButtonInteraction,
  applicantId: string,
): Promise<void> {
  const originalEmbed = interaction.message.embeds[0];
  const now = formatActionTimestamp(new Date());

  const updatedEmbed = originalEmbed
    ? EmbedBuilder.from(originalEmbed)
        .setColor("Green")
        .setTitle("✅ Postulación APROBADA")
        .setFooter({
          text: `✅ Aprobado por ${interaction.user.username} el ${now}`,
        })
    : null;

  try {
    await interaction.update({
      embeds: updatedEmbed ? [updatedEmbed] : undefined,
      components: [disabledRow],
    });
  } catch (err) {
    logger.warn({ err }, "Failed to update application message");
  }

  try {
    const applicant = await interaction.client.users.fetch(applicantId);
    await applicant.send(
      "Buenas noticias, tu postulación ha sido preseleccionada y has avanzado a la siguiente fase del proceso. Un miembro del staff se pondrá en contacto contigo a la brevedad para indicarte los pasos a seguir y coordinar la siguiente etapa, mantente atento",
    );
  } catch (err) {
    logger.info({ err, applicantId }, "Could not DM applicant about decision");
  }
}

async function handleRejectButton(
  interaction: ButtonInteraction,
  applicantId: string,
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`postular_reject_modal_${applicantId}`)
    .setTitle("Razón del rechazo");

  const reasonInput = new TextInputBuilder()
    .setCustomId(REJECT_REASON_INPUT_ID)
    .setLabel("Razon del rechazo")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reasonInput,
  );
  modal.addComponents(row);

  try {
    await interaction.showModal(modal);
  } catch (err) {
    logger.error({ err, applicantId }, "Failed to show rejection modal");
  }
}

async function handlePostulationDecision(
  interaction: ButtonInteraction,
): Promise<void> {
  const match = interaction.customId.match(
    /^postular_(approve|reject)_(\d+)$/,
  );
  if (!match) return;

  const [, decision, applicantId] = match;
  if (!applicantId) return;

  if (!hasReviewPermission(interaction.member)) {
    await interaction.reply({
      content: "No tienes permiso para revisar postulaciones.",
      ephemeral: true,
    });
    return;
  }

  if (decision === "approve") {
    await handleApprove(interaction, applicantId);
    return;
  }

  await handleRejectButton(interaction, applicantId);
}

async function handleRejectionModalSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const match = interaction.customId.match(/^postular_reject_modal_(\d+)$/);
  if (!match) return;

  const [, applicantId] = match;
  if (!applicantId) return;

  if (!hasReviewPermission(interaction.member)) {
    await interaction.reply({
      content: "No tienes permiso para revisar postulaciones.",
      ephemeral: true,
    });
    return;
  }

  const reason = interaction.fields
    .getTextInputValue(REJECT_REASON_INPUT_ID)
    .trim();

  const message = interaction.message;
  const originalEmbed = message?.embeds[0];
  const now = formatActionTimestamp(new Date());

  const updatedEmbed = originalEmbed
    ? EmbedBuilder.from(originalEmbed)
        .setColor("Red")
        .setTitle("❌ Postulación RECHAZADA")
        .addFields({ name: "Razón del rechazo", value: reason })
        .setFooter({
          text: `❌ Rechazado por ${interaction.user.username} el ${now}`,
        })
    : null;

  try {
    if (interaction.isFromMessage()) {
      await interaction.update({
        embeds: updatedEmbed ? [updatedEmbed] : undefined,
        components: [disabledRow],
      });
    } else {
      await interaction.deferUpdate();
    }
  } catch (err) {
    logger.warn({ err }, "Failed to update application message");
  }

  try {
    const applicant = await interaction.client.users.fetch(applicantId);
    await applicant.send(
      `❌ Tu postulación fue RECHAZADA. Razón: ${reason}`,
    );
  } catch (err) {
    logger.info({ err, applicantId }, "Could not DM applicant about decision");
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

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("postular_reject_modal_")) {
      try {
        await handleRejectionModalSubmit(interaction);
      } catch (err) {
        logger.error({ err }, "Error handling rejection modal submission");
        if (!interaction.replied && !interaction.deferred) {
          try {
            await interaction.reply({
              content: "Hubo un error al procesar el rechazo.",
              ephemeral: true,
            });
          } catch (replyErr) {
            logger.error(
              { err: replyErr },
              "Failed to send rejection modal error reply",
            );
          }
        }
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
