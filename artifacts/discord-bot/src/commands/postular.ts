import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Message,
  type OverwriteResolvable,
  type TextChannel,
} from "discord.js";
import { logger } from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("postular")
  .setDescription(
    "Inicia el proceso de postulación al rol de Trial Helper por mensaje directo (DM).",
  );

const STAFF_ROLE_ID = process.env["STAFF_ROLE_ID"];

const QUESTIONS = [
  "Nombre:",
  "Edad:",
  "¿Tienes experiencia de staff?",
  "¿Con quién te sueles llevar en el server?",
  "¿Qué aportarías como STAFF?",
  "¿Qué tan activo eres a la semana?",
];

const ANSWER_TIMEOUT_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 5 * 60 * 1000;
const APPLICATIONS_CHANNEL_NAME = "postulaciones-staff";

const lastUsedAt = new Map<string, number>();

function formatRemainingCooldown(msRemaining: number): string {
  const totalSeconds = Math.ceil(msRemaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

async function getOrCreateApplicationsChannel(
  interaction: ChatInputCommandInteraction,
): Promise<TextChannel | null> {
  const guild = interaction.guild;
  if (!guild) {
    console.log("[postular] No guild on interaction, aborting channel lookup.");
    return null;
  }

  console.log(
    `[postular] Guild obtained: id=${guild.id} name="${guild.name}"`,
  );

  console.log(
    `[postular] Searching for existing channel named "${APPLICATIONS_CHANNEL_NAME}"...`,
  );

  let existing;
  try {
    // Make sure the channel cache is fresh in case the channel exists but
    // wasn't cached yet (e.g. bot just started).
    await guild.channels.fetch();
    existing = guild.channels.cache.find(
      (channel) =>
        channel.name === APPLICATIONS_CHANNEL_NAME &&
        channel.type === ChannelType.GuildText,
    );
  } catch (err) {
    console.error(
      `[postular] ERROR while fetching/searching guild channels:`,
      err,
    );
    return null;
  }

  if (existing) {
    console.log(
      `[postular] Found existing channel: id=${existing.id} name="${existing.name}"`,
    );
    const existingChannel = existing as TextChannel;
    console.log(
      `[postular] Ensuring existing channel id=${existingChannel.id} has correct private permissions...`,
    );
    try {
      await applyApplicationsChannelPermissions(existingChannel, guild.id);
      console.log(
        `[postular] Permissions verified/updated on existing channel id=${existingChannel.id}`,
      );
    } catch (err) {
      console.error(
        `[postular] ERROR updating permissions on existing channel id=${existingChannel.id}:`,
        err,
      );
      logger.warn(
        { err, channelId: existingChannel.id },
        "Failed to update permissions on existing applications channel",
      );
    }
    return existingChannel;
  }

  console.log(
    `[postular] Channel "${APPLICATIONS_CHANNEL_NAME}" not found. Attempting to create it...`,
  );

  try {
    const created = await guild.channels.create({
      name: APPLICATIONS_CHANNEL_NAME,
      type: ChannelType.GuildText,
      reason: "Canal privado para revisar postulaciones de staff",
      permissionOverwrites: buildApplicationsChannelOverwrites(guild.id),
    });
    console.log(
      `[postular] Successfully created private channel: id=${created.id} name="${created.name}"`,
    );
    return created;
  } catch (err) {
    console.error(
      `[postular] ERROR creating channel "${APPLICATIONS_CHANNEL_NAME}" in guild ${guild.id}:`,
      err,
    );
    logger.warn(
      { err, guildId: guild.id },
      "Failed to create applications channel",
    );
    return null;
  }
}

function buildApplicationsChannelOverwrites(
  guildId: string,
): OverwriteResolvable[] {
  const overwrites: OverwriteResolvable[] = [
    {
      id: guildId,
      deny: [PermissionFlagsBits.ViewChannel],
    },
  ];

  if (STAFF_ROLE_ID) {
    overwrites.push({
      id: STAFF_ROLE_ID,
      allow: [PermissionFlagsBits.ViewChannel],
    });
  }

  return overwrites;
}

async function applyApplicationsChannelPermissions(
  channel: TextChannel,
  guildId: string,
): Promise<void> {
  await channel.permissionOverwrites.edit(guildId, {
    ViewChannel: false,
  });

  if (STAFF_ROLE_ID) {
    await channel.permissionOverwrites.edit(STAFF_ROLE_ID, {
      ViewChannel: true,
    });
  }
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const user = interaction.user;

  if (!interaction.guild) {
    await interaction.reply({
      content: "Este comando solo se puede usar dentro de un servidor.",
      ephemeral: true,
    });
    return;
  }

  const now = Date.now();
  const lastUsed = lastUsedAt.get(user.id);
  if (lastUsed !== undefined) {
    const elapsed = now - lastUsed;
    if (elapsed < COOLDOWN_MS) {
      await interaction.reply({
        content: `Debes esperar ${formatRemainingCooldown(COOLDOWN_MS - elapsed)} antes de volver a postularte.`,
        ephemeral: true,
      });
      return;
    }
  }

  let dmChannel;
  try {
    dmChannel = await user.createDM();
    await dmChannel.send(
      `¡Hola ${user.username}! Vamos a comenzar tu postulación para el rol de Trial Helper. Responde cada pregunta con sinceridad. Tendrás hasta 5 minutos para responder cada una.`,
    );
  } catch (err) {
    logger.warn({ err, userId: user.id }, "Could not open DM with user");
    await interaction.reply({
      content:
        "No pude enviarte un mensaje directo. Revisa tu configuración de privacidad y permite mensajes directos de miembros del servidor.",
      ephemeral: true,
    });
    return;
  }

  lastUsedAt.set(user.id, now);

  await interaction.reply({
    content: "Te envié un mensaje directo para continuar con tu postulación.",
    ephemeral: true,
  });

  const answers: string[] = [];

  for (const question of QUESTIONS) {
    await dmChannel.send(question);

    try {
      const collected = await dmChannel.awaitMessages({
        filter: (msg: Message) => msg.author.id === user.id,
        max: 1,
        time: ANSWER_TIMEOUT_MS,
        errors: ["time"],
      });
      const answer = collected.first()?.content ?? "";
      answers.push(answer);
    } catch (err) {
      logger.info({ err, userId: user.id }, "Postulation timed out");
      await dmChannel.send(
        "No recibí una respuesta a tiempo. Tu postulación fue cancelada. Usa /postular de nuevo cuando quieras intentarlo.",
      );
      return;
    }
  }

  console.log(
    `[postular] Questionnaire finished for userId=${user.id} username=${user.username}. Answers:`,
    answers,
  );
  logger.info(
    { userId: user.id, username: user.username },
    "Postulation completed",
  );

  let applicationsChannel: TextChannel | null;
  try {
    applicationsChannel = await getOrCreateApplicationsChannel(interaction);
  } catch (err) {
    console.error(
      `[postular] ERROR while resolving applications channel:`,
      err,
    );
    applicationsChannel = null;
  }

  if (!applicationsChannel) {
    console.error(
      `[postular] Aborting: no applications channel available for userId=${user.id} guildId=${interaction.guild.id}. Application was NOT posted.`,
    );
    logger.warn(
      { userId: user.id, guildId: interaction.guild.id },
      "No applications channel available to post to",
    );
    try {
      await dmChannel.send(
        "⚠️ Hubo un problema al enviar tu postulación al staff. Por favor contacta a un administrador.",
      );
    } catch (err) {
      console.error(
        `[postular] ERROR sending failure notice DM to userId=${user.id}:`,
        err,
      );
    }
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("📩 Nueva Postulación - Staff")
    .setColor("Yellow")
    .setThumbnail(user.displayAvatarURL())
    .setDescription(`Postulación de <@${user.id}> (${user.username})`)
    .addFields(
      QUESTIONS.map((question, index) => ({
        name: question,
        value: answers[index] || "N/A",
      })),
    )
    .setFooter({ text: "Pendiente de revisión por staff" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`postular_approve_${user.id}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`postular_reject_${user.id}`)
      .setLabel("Reject")
      .setStyle(ButtonStyle.Danger),
  );

  console.log(
    `[postular] Sending application embed to channel id=${applicationsChannel.id} name="${applicationsChannel.name}"...`,
  );

  let sentMessage;
  try {
    sentMessage = await applicationsChannel.send({
      embeds: [embed],
      components: [row],
    });
    console.log(
      `[postular] Embed sent successfully. messageId=${sentMessage.id} channelId=${applicationsChannel.id}`,
    );
  } catch (err) {
    console.error(
      `[postular] ERROR sending embed to channel id=${applicationsChannel.id} name="${applicationsChannel.name}":`,
      err,
    );
    logger.warn(
      { err, channelId: applicationsChannel.id },
      "Failed to post application to applications channel",
    );
    try {
      await dmChannel.send(
        "⚠️ Hubo un problema al enviar tu postulación al staff. Por favor contacta a un administrador.",
      );
    } catch (dmErr) {
      console.error(
        `[postular] ERROR sending failure notice DM to userId=${user.id}:`,
        dmErr,
      );
    }
    return;
  }

  console.log(
    `[postular] Sending success confirmation DM to userId=${user.id}...`,
  );
  try {
    await dmChannel.send("✅ Tu postulación fue enviada al staff.");
    console.log(
      `[postular] Success confirmation DM sent to userId=${user.id}.`,
    );
  } catch (err) {
    console.error(
      `[postular] ERROR sending success confirmation DM to userId=${user.id}:`,
      err,
    );
  }
}
