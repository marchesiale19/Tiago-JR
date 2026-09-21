import {
  SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction,
} from "discord.js";
import { joinQueue } from "../services/QueueService";
import { logger }     from "../lib/logger";

// canales
const AMONG_US_VOICE_CHANNELS = [
  "1452030683588333568",
  "1478541699041984583",
  "1452030713791774882",
  "1452030742602453174",
  "1452174467441627208",
  "1462162035185029356",
  "1462517911607316480",
  "1478541393470292211",
  "1478541114695749702",
  "1499495604680917124",
  "1549583617557012530",
  "1538256157347418183"
];

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
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const voiceChannel = member.voice.channel;

    console.log(`[DEBUG_VC] Usuario en canal: "${voiceChannel?.name}" con ID: "${voiceChannel?.id}"`);
    if (!voiceChannel || !AMONG_US_VOICE_CHANNELS.includes(voiceChannel.id)) {
      await interaction.editReply({ 
        content: `❌ Tu canal actual (ID: \`${voiceChannel?.id ?? "Ninguno"}\`) no está autorizado.` 
      });
      return;
    }


    const result = await joinQueue(
      interaction.user.id,
      interaction.guild.id,
      interaction.client,
    voiceChannel.id, 
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
