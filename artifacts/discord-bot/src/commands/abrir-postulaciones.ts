import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { setApplicationsOpen } from "../lib/applications-state";
import { logger } from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("abrir-postulaciones")
  .setDescription("Abre las postulaciones para el rol de Trial Helper.")
  .setDefaultMemberPermissions(PermissionFlagsBits.MentionEveryone);

(data as any).staffOnly = true;
(data as any).category = "Postulaciones";

const ROL_AUTORIZADO_ID = "1455419124732657801";

function hasStaffPermission(member: any): boolean {
  if (!member || typeof member !== "object") return false;
  if (!member.roles?.cache) return false;

  // Verifica si el usuario tiene el rol específico o permisos de Administrador
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  
  return member.roles.cache.has(ROL_AUTORIZADO_ID);
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!hasStaffPermission(interaction.member)) {
    await interaction.reply({
      content:
        "❌ No tienes permiso para usar este comando. Se requiere ser parte del Equipo Administrativo para gestionar las postulaciones.",
      ephemeral: true,
    });
    return;
  }

  setApplicationsOpen(true);

  logger.info(
    { userId: interaction.user.id },
    "Applications opened via /abrir-postulaciones",
  );

  const announcementEmbed = new EmbedBuilder()
    .setTitle(" 📢 ¡Las postulaciones están ABIERTAS!")
    .setColor("Green")
    .setDescription(
      "Las postulaciones para **Trial Helper** han sido abiertas.\n\n" +
        "Usa el comando `/postular` para iniciar tu proceso de postulación por mensaje directo.\n\n" +
        "¡Mucha suerte a todos los participantes! 🍀",
    )
    .setTimestamp()
    .setFooter({ text: `Abierto por ${interaction.user.username}` });

  try {
    await interaction.reply({ embeds: [announcementEmbed] });
  } catch (err) {
    logger.warn({ err }, "Could not send applications-open announcement");
  }
}