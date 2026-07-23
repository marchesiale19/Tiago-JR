import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { setApplicationsOpen } from "../lib/applications-state";
import { logger } from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("abrir-postulaciones")
  .setDescription("Abre las postulaciones para el rol de Trial Helper.");

(data as any).staffOnly = true;
(data as any).category = "Postulaciones";

const ROL_REFERENCIA = "Moderador [PB]";

function hasStaffPermission(member: any): boolean {
  if (!member || typeof member !== "object") return false;
  if (!member.guild || !member.roles?.cache) return false;

  const rolReferencia = member.guild.roles.cache.find(
    (r: any) => r.name === ROL_REFERENCIA,
  );
  if (!rolReferencia) return false;

  const highestRole = member.roles.highest;
  return highestRole.position >= rolReferencia.position;
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!hasStaffPermission(interaction.member)) {
    await interaction.reply({
      content:
        "❌ No tienes permiso para usar este comando. Se requiere el rango de **Moderador [PB]** o superior.",
      ephemeral: true,
    });
    return;
  }

  setApplicationsOpen(true);

  logger.info(
    { userId: interaction.user.id },
    "Applications opened via /abrir-postulaciones",
  );

  // Confirmación privada al staff que ejecutó el comando
  await interaction.reply({
    content: "✅ Las postulaciones para Trial Helper han sido ABIERTAS.",
    ephemeral: true,
  });

  // Anuncio público en el canal donde se ejecutó el comando
  if (interaction.channel && "send" in interaction.channel) {
    const announcementEmbed = new EmbedBuilder()
      .setTitle("📢 ¡Las postulaciones están ABIERTAS!")
      .setColor("Orange")
      .setDescription(
        "Las postulaciones para el rol de **Trial Helper** han sido abiertas por el staff.\n\n" +
          "Usa el comando `/postular` para iniciar tu proceso de postulación por mensaje directo.\n\n" +
          "¡Mucha suerte a todos los participantes! 🍀",
      )
      .setTimestamp()
      .setFooter({ text: `Abierto por ${interaction.user.username}` });

    try {
      await (interaction.channel as TextChannel).send({
        embeds: [announcementEmbed],
      });
    } catch (err) {
      logger.warn(
        { err },
        "Could not send public applications-open announcement",
      );
    }
  }
}
