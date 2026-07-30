import {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { lobbyRepository }  from "../database/repositories/LobbyRepository";
import { matchRepository }  from "../database/repositories/MatchRepository";
import { sendReplacementSupervisionRequest } from "../services/SupervisorService";
import { logger } from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("supervisor")
  .setDescription("Gestiona la supervisión de partidas.")
  .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
  .addSubcommand((sub) =>
    sub
      .setName("inactivo")
      .setDescription("Solicita un supervisor de reemplazo para la partida activa."),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub !== "inactivo") return;

  await interaction.deferReply({ ephemeral: true });

  if (!interaction.guild) {
    await interaction.editReply("Este comando solo funciona en un servidor.");
    return;
  }

  try {
    // Find an active in_game lobby where the caller is a participant
    const lobby = await lobbyRepository.findActiveForUser(interaction.user.id);
    if (!lobby || lobby.status !== "in_game") {
      await interaction.editReply("❌ No estás en ninguna partida en curso.");
      return;
    }

    const partida = await matchRepository.findByLobbyId(lobby.id);
    if (!partida) {
      await interaction.editReply("❌ No se encontró la partida.");
      return;
    }

    await sendReplacementSupervisionRequest(
      partida.id,
      lobby.id,
      interaction.guild.id,
      interaction.client,
    );

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("Yellow")
          .setTitle("⚠️ Solicitud de reemplazo enviada")
          .setDescription(
            "Se ha publicado una solicitud de supervisor de reemplazo.\n" +
            "El primer supervisor disponible tomará el control.",
          )
          .setTimestamp(),
      ],
    });
  } catch (err: any) {
    logger.error({ err }, "Error in /supervisor inactivo");
    await interaction.editReply(`❌ ${err?.message ?? "Error desconocido."}`);
  }
}
