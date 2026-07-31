// /cancelar emparejamiento — removes the caller from the matchmaking queue.

import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { leaveQueue } from "../services/QueueService";
import { logger }    from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("cancelar")
  .setDescription("Cancela tu búsqueda de partida.")
  .addSubcommand((sub) =>
    sub
      .setName("emparejamiento")
      .setDescription("Sal de la cola de emparejamiento si estás buscando partida."),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub !== "emparejamiento") return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await leaveQueue(interaction.user.id);

    if (!result.left) {
      await interaction.editReply(
        `ℹ️ ${result.reason ?? "No estás buscando partida en este momento."}`,
      );
      return;
    }

    const embed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle("✅ Has salido de la cola")
      .setDescription("Ya no estás buscando partida. Puedes volver a usar `/buscar partida` cuando quieras.")
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Error in /cancelar emparejamiento");
    await interaction.editReply("❌ Ocurrió un error al salir de la cola.");
  }
}
