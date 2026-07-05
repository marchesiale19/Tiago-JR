import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import { logger } from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("postular")
  .setDescription(
    "Inicia el proceso de postulación por mensaje directo (DM).",
  );

const QUESTIONS = [
  "¿Cuál es tu nombre completo?",
  "¿Cuántos años tienes?",
  "¿Por qué quieres unirte a este servidor?",
  "¿Tienes experiencia previa relevante? Cuéntanos brevemente.",
  "¿Cómo te enteraste de nosotros?",
];

const ANSWER_TIMEOUT_MS = 5 * 60 * 1000;

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const user = interaction.user;

  let dmChannel;
  try {
    dmChannel = await user.createDM();
    await dmChannel.send(
      `¡Hola ${user.username}! Vamos a comenzar tu postulación. Responde cada pregunta con un mensaje. Tienes 5 minutos por pregunta.`,
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
    `¡Gracias por completar tu postulación! Aquí está un resumen de tus respuestas:\n\n${summary}`,
  );

  logger.info(
    { userId: user.id, username: user.username },
    "Postulation completed",
  );

  const logChannelId = process.env["APPLICATION_LOG_CHANNEL_ID"];
  if (logChannelId) {
    try {
      const channel = await interaction.client.channels.fetch(logChannelId);
      if (channel?.isTextBased() && "send" in channel) {
        await channel.send(
          `📋 Nueva postulación de <@${user.id}> (${user.username})\n\n${summary}`,
        );
      }
    } catch (err) {
      logger.warn(
        { err, logChannelId },
        "Failed to post application to log channel",
      );
    }
  }
}
