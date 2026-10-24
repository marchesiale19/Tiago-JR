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
import { UnbelievaBoatClient } from "unb-api";

const TIME_LIMIT_MS = 6_000;
const COOLDOWN_MS = 20_000;
const MIN_BET = 100;

// Cliente de UnbelievaBoat
const unb = new UnbelievaBoatClient(process.env.UNBELIEVABOAT_TOKEN || "");

export const data = new SlashCommandBuilder()
  .setName("math")
  .setDescription("Resuelve un reto matemático contrarreloj por dinero.")
  .addIntegerOption((option) =>
    option
      .setName("apuesta")
      .setDescription("Monto a apostar (Mínimo 100)")
      .setRequired(true)
      .setMinValue(MIN_BET)
  );

type StartOptions = {
  guildId: string;
  channelId: string;
  userId: string;
  betAmount: number;
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
    betAmount,
    channel,
    sendQuestion,
  } = options;

  if (betAmount < MIN_BET) {
    await sendQuestion(
      `❌ La apuesta mínima para jugar es de **$${MIN_BET}**.`,
    );
    return;
  }

  // Verificar saldo en UnbelievaBoat
  try {
    const userBalance = await unb.getUserBalance(guildId, userId);
    if (userBalance.cash < betAmount) {
      await sendQuestion(
        `❌ No tenés suficiente dinero en mano para apostar **$${betAmount}**. ` +
          `Tu saldo actual es de **$${userBalance.cash}**.`,
      );
      return;
    }
  } catch (error) {
    console.error("[MATH] Error al consultar saldo en UnbelievaBoat:", error);
    await sendQuestion(
      "⚠️ No se pudo verificar tu saldo. Intentalo de nuevo en unos momentos.",
    );
    return;
  }

  const now = new Date();

  // Expira únicamente los retos cuyo plazo terminó
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

  // Cobrar la apuesta inicial
  try {
    await unb.editUserBalance(guildId, userId, { cash: -betAmount }, "Reto matemático - Entrada");
  } catch (error) {
    console.error("[MATH] Error al descontar apuesta:", error);
    await sendQuestion("⚠️ Error al procesar tu apuesta.");
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
      `🧠 **Reto matemático por $${betAmount}**\n` +
        `Resolvé: **${question.expression} = ?**\n` +
        `Tenés **6 segundos** para responder en este canal.`,
    );
  } catch (error) {
    // Si falla el envío, cancelar reto y reembolsar plata
    await db
      .update(mathChallenges)
      .set({
        status: "cancelled",
        completedAt: new Date(),
      })
      .where(eq(mathChallenges.id, challenge.id));

    await unb.editUserBalance(guildId, userId, { cash: betAmount }, "Reto matemático - Reembolso por fallo");
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

  // Caso: Se terminó el tiempo (Reembolso completo)
  if (!answer) {
    await db
      .update(mathChallenges)
      .set({
        status: "expired",
        completedAt: finishedAt,
      })
      .where(eq(mathChallenges.id, challenge.id));

    await unb.editUserBalance(guildId, userId, { cash: betAmount }, "Reto matemático - Devolución por tiempo agotado");

    await channel.send(
      `⌛ Se terminó el tiempo de <@${userId}>. ` +
        `La respuesta correcta era **${question.answer}**.\n` +
        `🪙 Te devolvimos tus **$${betAmount}**.`,
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
    // Si gana, le pagamos el doble (monto apostado x 2)
    const reward = betAmount * 2;
    await unb.editUserBalance(guildId, userId, { cash: reward }, "Reto matemático - Victoria (2x)");

    await channel.send(
      `✅ ¡Correcto, <@${userId}>! ` +
        `La respuesta era **${question.answer}**.\n` +
        `🎉 ¡Ganaste **$${reward}** (2x de tu apuesta)!`,
    );
  } else {
    await channel.send(
      `❌ Respuesta incorrecta, <@${userId}>. ` +
        `La respuesta correcta era **${question.answer}**.\n` +
        `💸 Perdiste tu apuesta de **$${betAmount}**.`,
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

  const betAmount = interaction.options.getInteger("apuesta", true);

  await interaction.deferReply();

  try {
    await startChallenge({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      betAmount,
      channel: interaction.channel,
      sendQuestion: async (content) => {
        await interaction.editReply(content);
        return interaction.fetchReply();
      },
    });
  } catch (error) {
    console.error("[MATH] Error al ejecutar el reto:", error);

    const details =
      error instanceof Error
        ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
        : String(error);

    console.error("[MATH] Detalles completos:", details);

    await interaction.editReply(
      "No pude completar el reto. Revisá los registros del bot.",
    );
  }
}

export async function run(
  message: Message,
  args: string[],
): Promise<void> {
  if (!message.guildId) {
    await message.reply(
      "Este comando solo funciona dentro de un servidor.",
    );

    return;
  }

  const rawBet = args[0];
  const betAmount = parseInt(rawBet, 10);

  if (!rawBet || isNaN(betAmount)) {
    await message.reply(
      `❌ Debes ingresar un monto válido para apostar. Ejemplo: \`!math ${MIN_BET}\``,
    );
    return;
  }

  try {
    const channel = message.channel as TextBasedChannel;

    await startChallenge({
      guildId: message.guildId,
      channelId: message.channelId,
      userId: message.author.id,
      betAmount,
      channel,
      sendQuestion: (content) => channel.send(content),
    });
  } catch (error) {
    console.error("[MATH] Error al ejecutar el reto:", error);

    const details =
      error instanceof Error
        ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
        : String(error);

    console.error("[MATH] Detalles completos:", details);

    await message.reply(
      "No pude completar el reto. Revisá los registros del bot.",
    );
  }
}
