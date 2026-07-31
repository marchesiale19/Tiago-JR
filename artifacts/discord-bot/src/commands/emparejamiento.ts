// /emparejamiento estado — displays the current matchmaking queue status.

import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getQueueStatus } from "../services/QueueService";
import { logger }         from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("emparejamiento")
  .setDescription("Información sobre el emparejamiento ranked.")
  .addSubcommand((sub) =>
    sub
      .setName("estado")
      .setDescription("Muestra el estado actual de la cola de emparejamiento."),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub !== "estado") return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const { lobby, count, max } = await getQueueStatus();

    if (!lobby) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Orange")
            .setTitle("🎮 Estado del Emparejamiento")
            .setDescription("No hay ninguna cola de emparejamiento activa en este momento.")
            .setTimestamp(),
        ],
      });
      return;
    }

    const filled  = "🟩".repeat(count) + "⬜".repeat(Math.max(0, max - count));
    const pct     = Math.round((count / max) * 100);

    const embed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle("🎮 Estado del Emparejamiento")
      .addFields(
        {
          name:   "Jugadores en cola",
          value:  `**${count} / ${max}**\n${filled}`,
          inline: false,
        },
        {
          name:   "Jugadores requeridos",
          value:  `${max}`,
          inline: true,
        },
        {
          name:   "Progreso",
          value:  `${pct}%`,
          inline: true,
        },
      )
      .setFooter({ text: "La partida inicia automáticamente cuando la cola esté llena." })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Error in /emparejamiento estado");
    await interaction.editReply("❌ Ocurrió un error al consultar el estado del emparejamiento.");
  }
}
