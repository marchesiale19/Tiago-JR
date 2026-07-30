import {
  SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction,
} from "discord.js";
import { lobbyRepository } from "../database/repositories/LobbyRepository";
import { matchRepository } from "../database/repositories/MatchRepository";
import { logger } from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("partida")
  .setDescription("Información sobre tu partida activa.")
  .addSubcommand((sub) =>
    sub.setName("estado").setDescription("Muestra el estado de tu partida actual."),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub !== "estado") return;

  await interaction.deferReply({ ephemeral: true });

  try {
    // Find the active match for this player
    const lobby = await lobbyRepository.findActiveForUser(interaction.user.id);
    if (!lobby || !["in_game", "validating"].includes(lobby.status)) {
      await interaction.editReply("ℹ️ No tienes ninguna partida activa en este momento.");
      return;
    }

    const partida = await matchRepository.findByLobbyId(lobby.id);
    if (!partida) {
      await interaction.editReply("ℹ️ No se encontró la partida asociada a tu lobby.");
      return;
    }

    // Check the player is actually a participant in this match
    const participants = await matchRepository.listParticipants(partida.id);
    const isMember     = participants.some((p) => p.discordId === interaction.user.id);
    if (!isMember) {
      await interaction.editReply("❌ No eres participante de esta partida.");
      return;
    }

    const playerList = participants
      .map((p) => `<@${p.discordId}>`)
      .join(", ");

    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle("🎮 Estado de la Partida")
      .addFields(
        { name: "Partida ID",   value: `\`${partida.id.slice(0, 8)}\``,                         inline: true },
        { name: "Estado",       value: partida.status.toUpperCase(),                             inline: true },
        { name: "Supervisor",   value: lobby.supervisorId ? `<@${lobby.supervisorId}>` : "—",    inline: true },
        { name: "Canal de Voz", value: lobby.voiceChannelId ? `<#${lobby.voiceChannelId}>` : "—", inline: true },
        { name: "Código",       value: (partida as any).codigoPartida ?? "—",                    inline: true },
        { name: "Mapa",         value: (partida as any).mapa ?? "—",                             inline: true },
        { name: `Jugadores (${participants.length})`, value: playerList || "—",                  inline: false },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Error in /partida estado");
    await interaction.editReply("❌ Ocurrió un error al obtener el estado de la partida.");
  }
}
