import {
  SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction,
} from "discord.js";
import { joinQueue } from "../services/QueueService";
import { logger }    from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("buscar")
  .setDescription("Busca una partida ranked.")
  .addSubcommand((sub) =>
    sub
      .setName("partida")
      .setDescription("Únete a la cola para una partida ranked. Debes estar en un canal de Among Us."),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub !== "partida") return;

  if (!interaction.guild) {
    await interaction.reply({ content: "Este comando solo funciona en un servidor.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Fetch the member to inspect their voice state
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const voiceChannel = member.voice.channel;
    const vcName       = voiceChannel?.name ?? null;

    const result = await joinQueue(
      interaction.user.id,
      interaction.guild.id,
      interaction.client,
      vcName,
    );

    if (!result.joined) {
      await interaction.editReply(`❌ ${result.reason}`);
      return;
    }

    const filled = "🟩".repeat(result.count) + "⬜".repeat(Math.max(0, result.max - result.count));

    const embed = new EmbedBuilder()
      .setColor(result.count >= result.max ? "Yellow" : "Green")
      .setTitle("✅ Buscando partida…")
      .addFields(
        { name: "Jugadores en cola", value: `${result.count} / ${result.max}  ${filled}`, inline: false },
      )
      .setTimestamp();

    if (result.count >= result.max) {
      embed.setDescription("¡Cola llena! Buscando supervisor…");
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Error in /buscar partida");
    await interaction.editReply("❌ Ocurrió un error al buscar partida.");
  }
}
