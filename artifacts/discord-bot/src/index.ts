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
const LOGS_CHANNEL_NAME = "logs-postulaciones";

function formatActionTimestamp(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatTimeOfDay(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

async function sendAuditLog(
  guild: NonNullable<ButtonInteraction["guild"]>,
  params: {
    applicantUsername: string;
    startedAt: Date | null;
    result: "Aprobado" | "Rechazado";
    staffUsername: string;
  },
): Promise<void> {
  let channel;
  try {
    await guild.channels.fetch();
    channel = guild.channels.cache.find(
      (c) => c.name === LOGS_CHANNEL_NAME && c.isTextBased(),
    );
  } catch (err) {
    console.warn(
      `[audit-log] WARNING: error while searching for channel "${LOGS_CHANNEL_NAME}" in guild ${guild.id}:`,
      err,
    );
    return;
  }

  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    console.warn(
      `[audit-log] WARNING: channel "${LOGS_CHANNEL_NAME}" was not found (or is not a valid text channel) in guild ${guild.id}. Skipping audit log message.`,
    );
    return;
  }

  const timeLabel = params.startedAt
    ? formatTimeOfDay(params.startedAt)
    : "N/A";
  const message = `${params.applicantUsername} se postuló a las ${timeLabel}. Resultado: ${params.result} por ${params.staffUsername}`;

  try {
    await channel.send(message);
  } catch (err) {
    console.warn(
      `[audit-log] WARNING: failed to send audit log message to channel "${LOGS_CHANNEL_NAME}" (id=${channel.id}), likely missing permissions:`,
      err,
    );
  }
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

const POSTULADOS_ROLE_NAME = "Postulados";

async function assignPostuladosRole(
  interaction: ButtonInteraction,
  applicantId: string,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    console.error(
      "[postular] Cannot assign role: no guild on approval interaction.",
    );
    return;
  }

  let role;
  try {
    await guild.roles.fetch();
    role = guild.roles.cache.find((r) => r.name === POSTULADOS_ROLE_NAME);
  } catch (err) {
    console.error(
      `[postular] ERROR fetching roles while searching for "${POSTULADOS_ROLE_NAME}":`,
      err,
    );
    return;
  }

  if (!role) {
    console.error(
      `[postular] Role "${POSTULADOS_ROLE_NAME}" not found in guild ${guild.id}. Skipping role assignment.`,
    );
    return;
  }

  try {
    const member = await guild.members.fetch(applicantId);
    await member.roles.add(role);
  } catch (err) {
    logger.warn(
      { err, applicantId, guildId: guild.id },
      "Failed to assign Postulados role to applicant",
    );
  }
}

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

  let applicant;
  try {
    applicant = await interaction.client.users.fetch(applicantId);
    await applicant.send(
      "Buenas noticias, tu postulación ha sido preseleccionada y has avanzado a la siguiente fase del proceso. Un miembro del staff se pondrá en contacto contigo a la brevedad para indicarte los pasos a seguir y coordinar la siguiente etapa, mantente atento",
    );
  } catch (err) {
    logger.info({ err, applicantId }, "Could not DM applicant about decision");
  }

  await assignPostuladosRole(interaction, applicantId);

  if (interaction.guild) {
    await sendAuditLog(interaction.guild, {
      applicantUsername: applicant?.username ?? applicantId,
      startedAt: originalEmbed?.timestamp
        ? new Date(originalEmbed.timestamp)
        : null,
      result: "Aprobado",
      staffUsername: interaction.user.username,
    });
  } else {
    console.warn(
      "[audit-log] WARNING: no guild on approval interaction; skipping audit log message.",
    );
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

  let applicant;
  try {
    applicant = await interaction.client.users.fetch(applicantId);
    await applicant.send(
      `❌ Tu postulación fue RECHAZADA. Razón: ${reason}`,
    );
  } catch (err) {
    logger.info({ err, applicantId }, "Could not DM applicant about decision");
  }

  if (interaction.guild) {
    await sendAuditLog(interaction.guild, {
      applicantUsername: applicant?.username ?? applicantId,
      startedAt: originalEmbed?.timestamp
        ? new Date(originalEmbed.timestamp)
        : null,
      result: "Rechazado",
      staffUsername: interaction.user.username,
    });
  } else {
    console.warn(
      "[audit-log] WARNING: no guild on rejection interaction; skipping audit log message.",
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
