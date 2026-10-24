
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Message,
  type TextBasedChannel,
} from "discord.js";

import {
  and,
  desc,
  eq,
  gt,
  isNull,
  lte,
  or,
} from "drizzle-orm";

import { db } from "../database/database";
import { mathChallenges } from "@workspace/db/schema";
import { generateMathQuestion } from "../utils/mathQuestionGenerator";

const TIME_LIMIT_MS = 6_000;
const COOLDOWN_MS = 20_000;

export const data = new SlashCommandBuilder()
  .setName("math")
  .setDescription("Resuelve un reto matemático contrarreloj.");

type StartOptions = {
  guildId: string;
  channelId: string;
  userId: string;
  channel: TextBasedChannel;
  sendQuestion: (content: string) => Promise<Message>;
};

async function startChallenge(
  options: StartOptions,
): Promise<void> {
  const {
    guildId,
    channelId,
    userId,
    channel,
    sendQuestion,
  } = options;

  const now = new Date();

  // Expira únicamente los retos cuyo plazo terminó
  // o que quedaron sin fecha de vencimiento.
  await db
    .update(mathChallenges)
    .set({
      status: "expired",
      completedAt: now,
    })
    .where(
      and(
        eq(mathChallenges.status, "active"),
        or(
          isNull(mathChallenges.expiresAt),
          lte(mathChallenges.expiresAt, now),
        ),
      ),
    );

  // Impide que el usuario tenga dos retos simultáneos.
  const [activeChallenge] = await db
    .select({
      id: mathChallenges.id,
    })
    .from(mathChallenges)
    .where(
      and(
        eq(mathChallenges.guildId, guildId),
        eq(mathChallenges.userId, userId),
        eq(mathChallenges.status, "active"),
        gt(mathChallenges.expiresAt, now),
      ),
    )
    .limit(1);

  if (activeChallenge) {
    await sendQuestion(
      "🧠 Ya tenés un reto matemático activo. Respondé antes de iniciar otro.",
    );
    return;
  }

  // Comprueba el enfriamiento de 20 segundos.
  const cooldownStart = new Date(
    now.getTime() - COOLDOWN_MS,
  );

  const [lastChallenge] = await db
    .select({
      createdAt: mathChallenges.createdAt,
    })
    .from(mathChallenges)
    .where(
      and(
        eq(mathChallenges.guildId, guildId),
        eq(mathChallenges.userId, userId),
        gt(mathChallenges.createdAt, cooldownStart),
      ),
    )
    .orderBy(desc(mathChallenges.createdAt))
    .limit(1);

  if (lastChallenge) {
    const elapsed =
      now.getTime() - lastChallenge.createdAt.getTime();

    const remainingSeconds = Math.max(
      1,
      Math.ceil((COOLDOWN_MS - elapsed) / 1_000),
    );

    await sendQuestion(
      `⏳ Esperá **${remainingSeconds} segundos** antes de iniciar otro reto.`,
    );
    return;
  }

  const question = generateMathQuestion();

  // Crea el registro antes de publicar la pregunta.
  const [challenge] = await db
    .insert(mathChallenges)
    .values({
      guildId,
      channelId,
      userId,
      expression: question.expression,
      correctAnswer: question.answer,
      status: "pending",
    })
    .returning({
      id: mathChallenges.id,
    });

  let prompt: Message;

  try {
    prompt = await sendQuestion(
      `🧠 **Reto matemático**\n` +
        `Resolvé: **${question.expression} = ?**\n` +
        `Tenés **6 segundos** para responder en este canal.`,
    );
  } catch (error) {
    await db
      .update(mathChallenges)
      .set({
        status: "cancelled",
        completedAt: new Date(),
      })
      .where(eq(mathChallenges.id, challenge.id));

    throw error;
  }

  // El tiempo empieza una vez publicada la pregunta.
  const startedAt = new Date();
  const expiresAt = new Date(
    startedAt.getTime() + TIME_LIMIT_MS,
  );

  await db
    .update(mathChallenges)
    .set({
      status: "active",
      messageId: prompt.id,
      startedAt,
      expiresAt,
    })
    .where(eq(mathChallenges.id, challenge.id));

  const collector = channel.createMessageCollector({
    time: TIME_LIMIT_MS,
    max: 1,
    filter: (message) =>
      message.author.id === userId &&
      message.channelId === channelId,
  });

  const answer = await new Promise<Message | null>((resolve) => {
    collector.once("collect", (message) => {
      resolve(message);
    });

    collector.once("end", (collected) => {
      if (collected.size === 0) {
        resolve(null);
      }
    });
  });

  const finishedAt = new Date();

  if (!answer) {
    await db
      .update(mathChallenges)
      .set({
        status: "expired",
        completedAt: finishedAt,
      })
      .where(eq(mathChallenges.id, challenge.id));

    await channel.send(
      `⌛ Se terminó el tiempo de <@${userId}>. ` +
        `La respuesta correcta era **${question.answer}**.`,
    );

    return;
  }

  const rawAnswer = answer.content.trim();
  const isInteger = /^-?\d+$/.test(rawAnswer);

  const correct =
    isInteger &&
    Number(rawAnswer) === question.answer;

  await db
    .update(mathChallenges)
    .set({
      status: correct ? "completed" : "failed",
      answeredAt: finishedAt,
      completedAt: finishedAt,
    })
    .where(eq(mathChallenges.id, challenge.id));

  if (correct) {
    await channel.send(
      `✅ ¡Correcto, <@${userId}>! ` +
        `La respuesta era **${question.answer}**.`,
    );
  } else {
    await channel.send(
      `❌ Respuesta incorrecta, <@${userId}>. ` +
        `La respuesta correcta era **${question.answer}**.`,
    );
  }
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.channel) {
    await interaction.reply({
      content: "Este comando solo funciona dentro de un servidor.",
      ephemeral: true,
    });

    return;
  }

  await interaction.deferReply();

  try {
    await startChallenge({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      channel: interaction.channel,
      sendQuestion: async (content) => {
        await interaction.editReply(content);
        return interaction.fetchReply();
      },
    });
  } catch (error) {
    console.error("[MATH] Error al ejecutar el reto:", error);

    await interaction.editReply(
      "No pude completar el reto. Revisá los registros del bot.",
    );
  }
}

export async function run(
  message: Message,
  _args: string[],
): Promise<void> {
  if (!message.guildId) {
    await message.reply(
      "Este comando solo funciona dentro de un servidor.",
    );

    return;
  }

  try {
    const channel = message.channel as TextBasedChannel;

    await startChallenge({
      guildId: message.guildId,
      channelId: message.channelId,
      userId: message.author.id,
      channel,
      sendQuestion: (content) => channel.send(content),
    });
  } catch (error) {
    console.error("[MATH] Error al ejecutar el reto:", error);

    await message.reply(
      "No pude completar el reto. Revisá los registros del bot.",
    );
  }
}
