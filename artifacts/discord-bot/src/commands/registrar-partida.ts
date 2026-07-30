import {
  SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction,
} from "discord.js";
import { lobbyRepository } from "../database/repositories/LobbyRepository";
import { matchRepository } from "../database/repositories/MatchRepository";
import { logger } from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("registrar")
  .setDescription("Registra información de la partida.")
  .addSubcommand((sub) =>
    sub
      .setName("partida")
      .setDescription("Registra el código y mapa de tu partida activa. Solo supervisor.")
      .addStringOption((opt) =>
        opt
          .setName("codigo")
          .setDescription("Código de la sala de Among Us")
          .setRequired(true)
          .setMaxLength(10),
      )
      .addStringOption((opt) =>
        opt
          .setName("mapa")
          .setDescription("Mapa de la partida")
          .setRequired(true)
          .addChoices(
            { name: "The Skeld",       value: "The Skeld" },
            { name: "MIRA HQ",         value: "MIRA HQ" },
            { name: "Polus",           value: "Polus" },
            { name: "The Airship",     value: "The Airship" },
            { name: "The Fungle",      value: "The Fungle" },
          ),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub !== "partida") return;

  await interaction.deferReply({ ephemeral: true });

  try {
    // Verify this user is the supervisor of an active in_game lobby
    const lobby = await lobbyRepository.findBySupervisorAndStatus(
      interaction.user.id,
      "in_game" as any,
    );

    if (!lobby) {
      await interaction.editReply("❌ No eres el supervisor de ninguna partida activa.");
      return;
    }

    const partida = await matchRepository.findByLobbyId(lobby.id);
    if (!partida) {
      await interaction.editReply("❌ No se encontró la partida asociada.");
      return;
    }

    const codigo = interaction.options.getString("codigo", true).trim().toUpperCase();
    const mapa   = interaction.options.getString("mapa", true);

    await matchRepository.updateMatchDetails(partida.id, { codigoPartida: codigo, mapa });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("Green")
          .setTitle("✅ Partida registrada")
          .addFields(
            { name: "Código", value: codigo, inline: true },
            { name: "Mapa",   value: mapa,   inline: true },
            { name: "ID",     value: `\`${partida.id.slice(0, 8)}\``, inline: true },
          )
          .setTimestamp(),
      ],
    });
  } catch (err) {
    logger.error({ err }, "Error in /registrar partida");
    await interaction.editReply("❌ Ocurrió un error al registrar la partida.");
  }
}
