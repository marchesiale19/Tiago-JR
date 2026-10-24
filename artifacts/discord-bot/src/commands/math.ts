import {
  MessageCollector,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Message,
  type TextBasedChannel,
} from "discord.js";

import { and, desc, eq, gt } from "drizzle-orm";

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

  // Expira retos cuyo plazo ya terminó.
  await db
    .update(mathChallenges)
    .set({
      status: "expired",
      completedAt: now,
    })
    .where(
      and(
        eq(mathChallenges.status, "active"),
        // No se modifican retos que todavía tienen tiempo.
        // La comprobación exacta se hace con expiresAt.
        // Los retos sin vencimiento también se consideran inválidos.
        // El filtro se completa en la siguiente consulta.
        eq(mathChallenges.guildId, guildId),
        eq(mathChallenges.userId, userId),
      ),
    )
    .then(async () => {
      // La consulta de abajo no depende de este resultado.
    });

  const [lastChallenge] = await db
    .select({
      createdAt: mathChallenges.createdAt,
    })
    .from(mathChallenges)
    .where(
      and(
        eq(mathChallenges.guildId, guildId),
        eq(mathChallenges.userId, userId),
        gt(
          mathChallenges.createdAt,
          new Date(now.getTime() - COOLDOWN_MS),
        ),
      ),
    )
    .orderBy(desc(mathChallenges.createdAt))
    .limit(1);

  if (lastChallenge) {
    const remaining = Math.ceil(
      (
        lastChallenge.createdAt.getTime() +
        COOLDOWN_MS -
        now.getTime()
      ) / 1000,
    );

    await sendQuestion(
      `⏳ Esperá ${Math.max(1, remaining)} segundos antes de iniciar otro reto.`,
    );
    return;
  }

  const question = generateMathQuestion();

  const [challenge] = await db
    .insert(mathChallenges)
    .values({
      guildId,
      channelId,
      userId,
      expression: question.expression,
      correctAnswer: question.answer,
      status: "active",
      startedAt: now,
      expiresAt: new Date(now.getTime() + TIME_LIMIT_MS),
    })
    .returning({
      id: mathChallenges.id,
    });

  let prompt: Message;

  try {
    prompt = await sendQuestion(
      `🧠 **Reto matemático**\n` +
      `Resolvé: **${question.expression} = ?**\n` +
      `Tenés **6 segundos** para responder. Escribí el resultado en este canal.`,
    );

    await db
      .update(mathChallenges)
      .set({ messageId: prompt.id })
      .where(eq(mathChallenges.id, challenge.id));
  } catch (error) {
    await db
      .update(mathChallenges)
      .set({ status: "cancelled", completedAt: new Date() })
      .where(eq(mathChallenges.id, challenge.id));

    throw error;
  }

  const collector = new MessageCollector(channel, {
    time: TIME_LIMIT_MS,
    max: 1,
    filter: (message) =>
      message.author.id === userId &&
      message.channelId === channelId &&
      /^\s*-?\d+\s*$/.test(message.content),
  });

  const answer = await new Promise<Message | null>((resolve) => {
    collector.once("collect", (message) => resolve(message));
    collector.once("end", (collected) => {
      if (collected.size === 0) resolve(null);
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
      `⌛ Se terminó el tiempo de <@${userId}>. La respuesta era **${question.answer}**.`,
    );
    return;
  }

  const correct = Number(answer.content.trim()) === question.answer;

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
      `✅ ¡Correcto, <@${userId}>! La respuesta era **${question.answer}**.`,
    );
  } else {
    await channel.send(
      `❌ No era correcto, <@${userId}>. La respuesta era **${question.answer}**.`,
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
      "No pude iniciar o completar el reto. Revisá los registros del bot.",
    );
  }
}

export async function run(
  message: Message,
  _args: string[],
): Promise<void> {
  if (!message.guildId) {
    await message.reply("Este comando solo funciona dentro de un servidor.");
    return;
  }

  try {
    await startChallenge({
      guildId: message.guildId,
      channelId: message.channelId,
      userId: message.author.id,
      channel: message.channel as TextBasedChannel,
      sendQuestion: (content) => message.channel.send(content),
    });
  } catch (error) {
    console.error("[MATH] Error al ejecutar el reto:", error);

    await message.reply(
      "No pude iniciar o completar el reto. Revisá los registros del bot.",
    );
  }
}
