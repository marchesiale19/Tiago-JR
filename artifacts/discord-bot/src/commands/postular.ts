import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type ChatInputCommandInteraction,
  type Message,
  type TextChannel,
} from "discord.js";
import { logger } from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("postular")
  .setDescription(
    "Inicia el proceso de postulación al rol de Developer por mensaje directo (DM).",
  );

const QUESTIONS = [
  "Nombre:",
  "Edad:",
  "¿Tienes experiencia de staff?",
  "¿Con quiénes te la pasas?",
  "¿Qué aportarías al ser STAFF?",
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
  if (!guild) return null;

  const existing = guild.channels.cache.find(
    (channel) =>
      channel.name === APPLICATIONS_CHANNEL_NAME &&
      channel.type === ChannelType.GuildText,
  );
  if (existing) return existing as TextChannel;

  try {
    const created = await guild.channels.create({
      name: APPLICATIONS_CHANNEL_NAME,
      type: ChannelType.GuildText,
      reason: "Canal para revisar postulaciones de staff",
    });
    return created;
  } catch (err) {
    logger.warn(
      { err, guildId: guild.id },
      "Failed to create applications channel",
    );
    return null;
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
      `¡Hola ${user.username}! Vamos a comenzar tu postulación al rol de **Developer**. Responde cada pregunta con un mensaje. Tienes 5 minutos por pregunta.`,
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

  const summary = QUESTIONS.map(
    (question, index) => `**${question}**\n${answers[index]}`,
  ).join("\n\n");

  await dmChannel.send(
    `¡Gracias por completar tu postulación! Un miembro del staff revisará tus respuestas pronto.\n\n${summary}`,
  );

  logger.info(
    { userId: user.id, username: user.username },
    "Postulation completed",
  );

  const applicationsChannel = await getOrCreateApplicationsChannel(interaction);
  if (!applicationsChannel) {
    logger.warn(
      { userId: user.id, guildId: interaction.guild.id },
      "No applications channel available to post to",
    );
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("📋 Nueva postulación a Developer")
    .setColor(0x5865f2)
    .setThumbnail(user.displayAvatarURL())
    .setDescription(`Postulante: <@${user.id}> (${user.username})`)
    .addFields(
      QUESTIONS.map((question, index) => ({
        name: question,
        value: answers[index] || "(sin respuesta)",
      })),
    )
    .setFooter({ text: `ID de usuario: ${user.id}` })
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

  try {
    await applicationsChannel.send({ embeds: [embed], components: [row] });
  } catch (err) {
    logger.warn(
      { err, channelId: applicationsChannel.id },
      "Failed to post application to applications channel",
    );
  }
}
