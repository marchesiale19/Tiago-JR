import {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { lobbyRepository } from "../database/repositories/LobbyRepository";
import { setVCMute }        from "../services/RankedVCService";
import { logger }           from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("sala")
  .setDescription("Controla el audio de la sala ranked.")
  .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
  .addSubcommand((sub) =>
    sub.setName("mute").setDescription("Mutea a todos los jugadores de tu sala ranked. Solo supervisor."),
  )
  .addSubcommand((sub) =>
    sub.setName("unmute").setDescription("Desmutea a todos los jugadores de tu sala ranked. Solo supervisor."),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand() as "mute" | "unmute";
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.guild) {
    await interaction.editReply("Este comando solo funciona en un servidor.");
    return;
  }

  try {
    // Only the supervisor of an in_game lobby can use this
    const lobby = await lobbyRepository.findBySupervisorAndStatus(
      interaction.user.id,
      "in_game" as any,
    );

    if (!lobby) {
      await interaction.editReply("❌ No eres el supervisor de ninguna partida activa.");
      return;
    }

    if (!lobby.voiceChannelId) {
      await interaction.editReply("❌ No hay canal de voz asignado a esta partida.");
      return;
    }

    const mute = sub === "mute";
    await setVCMute(interaction.guild, lobby.voiceChannelId, mute);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(mute ? "Red" : "Green")
          .setTitle(mute ? "🔇 Sala muteada" : "🔊 Sala desmuteada")
          .setDescription(
            mute
              ? "Todos los jugadores del canal han sido silenciados."
              : "Todos los jugadores del canal han sido desmuteados.",
          )
          .addFields({ name: "Canal", value: `<#${lobby.voiceChannelId}>`, inline: true })
          .setTimestamp(),
      ],
    });
  } catch (err: any) {
    logger.error({ err, sub }, "Error in /sala command");
    await interaction.editReply(`❌ ${err?.message ?? "Error desconocido."}`);
  }
}
