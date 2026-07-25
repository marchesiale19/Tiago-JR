import {
  SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction,
} from "discord.js";
import { joinQueue, leaveQueue, getQueueStatus } from "../services/QueueService";
import { logger } from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("cola")
  .setDescription("Gestiona tu participación en la cola competitiva.")
  .addSubcommand((sub) =>
    sub.setName("unirse").setDescription("Únete a la cola de espera para una partida."),
  )
  .addSubcommand((sub) =>
    sub.setName("salir").setDescription("Sal de la cola de espera."),
  )
  .addSubcommand((sub) =>
    sub.setName("estado").setDescription("Muestra el estado actual de la cola."),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (!interaction.guild) {
    await interaction.reply({ content: "Este comando solo funciona en un servidor.", ephemeral: true });
    return;
  }

  if (sub === "unirse") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await joinQueue(
        interaction.user.id,
        interaction.guild.id,
        interaction.client,
      );

      if (!result.joined) {
        await interaction.editReply(`❌ ${result.reason}`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setTitle("✅ Te has unido a la cola")
        .addFields(
          { name: "Jugadores en cola", value: `${result.count} / ${result.max}`, inline: true },
        )
        .setTimestamp();

      if (result.count >= result.max) {
        embed.setDescription("¡La cola está llena! Se está buscando un supervisor...");
        embed.setColor("Yellow");
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error({ err }, "Error joining queue");
      await interaction.editReply("❌ Ocurrió un error al unirte a la cola.");
    }

  } else if (sub === "salir") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await leaveQueue(interaction.user.id);
      if (!result.left) {
        await interaction.editReply(`❌ ${result.reason}`);
        return;
      }
      await interaction.editReply("✅ Has salido de la cola.");
    } catch (err) {
      logger.error({ err }, "Error leaving queue");
      await interaction.editReply("❌ Ocurrió un error al salir de la cola.");
    }

  } else if (sub === "estado") {
    await interaction.deferReply({ ephemeral: false });
    try {
      const { lobby, count, max } = await getQueueStatus();

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setTitle("📋 Estado de la cola")
        .setTimestamp();

      if (!lobby) {
        embed.setDescription("No hay ninguna cola activa en este momento.");
      } else {
        const filled = "🟩".repeat(count) + "⬜".repeat(Math.max(0, max - count));
        embed.addFields(
          { name: "Jugadores",  value: `${count} / ${max}  ${filled}`, inline: false },
          { name: "Estado",     value: lobby.status.toUpperCase(),      inline: true  },
        );
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error({ err }, "Error getting queue status");
      await interaction.editReply("❌ Ocurrió un error al obtener el estado de la cola.");
    }
  }
}
