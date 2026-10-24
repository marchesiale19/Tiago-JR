
import {
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import { and, eq } from "drizzle-orm";
import { db, voiceStreaksTable } from "@workspace/db";

const TARGET_GUILD_ID = "1437644356977823884";
const MAX_GAP_MS = 48 * 60 * 60 * 1000;
const REWARD_AMOUNT = 100_000;

export const data = new SlashCommandBuilder()
  .setName("racha")
  .setDescription("Consulta tu racha de voz de Among Us.");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild() || interaction.guildId !== TARGET_GUILD_ID) {
    await interaction.reply({
      content: "Este comando solo está disponible en el servidor habilitado.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const [streak] = await db
      .select()
      .from(voiceStreaksTable)
      .where(
        and(
          eq(voiceStreaksTable.guildId, interaction.guildId),
          eq(voiceStreaksTable.userId, interaction.user.id),
        ),
      )
      .limit(1);

    if (!streak) {
      await interaction.editReply(
        "Todavía no tenés una racha registrada. ¡Participá en las asistencias de voz para empezar!",
      );
      return;
    }

    const expired =
      !streak.updatedAt ||
      Date.now() - new Date(streak.updatedAt).getTime() > MAX_GAP_MS;

    const currentStreak = expired ? 0 : streak.currentStreak;
    const bestStreak = streak.bestStreak;
    const nextMilestone = (Math.floor(currentStreak / 10) + 1) * 10;
    const daysRemaining = nextMilestone - currentStreak;
    const progress = currentStreak % 10;

    const progressBar =
      "🟧".repeat(progress) + "⬛".repeat(10 - progress);

    const embed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle("🔥 Tu racha de voz")
      .setDescription(
        `Estadísticas de racha de ${interaction.user}.`,
      )
      .addFields(
        {
          name: "📅 Racha actual",
          value: `**${currentStreak} ${currentStreak === 1 ? "día" : "días"}**`,
          inline: true,
        },
        {
          name: "🏆 Récord personal",
          value: `**${bestStreak} ${bestStreak === 1 ? "día" : "días"}**`,
          inline: true,
        },
        {
          name: "🎁 Próxima recompensa",
          value:
            `**${nextMilestone} días**\n` +
            `${daysRemaining} ${daysRemaining === 1 ? "día" : "días"} restantes\n` +
            `💰 ${REWARD_AMOUNT.toLocaleString("es-ES")} monedas`,
          inline: false,
        },
        {
          name: "📊 Progreso",
          value: `${progressBar}\n${progress}/10 días`,
          inline: false,
        },
      )
      .setFooter({
        text: "La racha depende de las asistencias válidas de voz.",
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Racha] Error al consultar la racha:", error);

    await interaction.editReply(
      "No pude consultar tu racha en este momento. Intentá nuevamente más tarde.",
    );
  }
}
