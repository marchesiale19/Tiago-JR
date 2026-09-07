import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { setApplicationsOpen } from "../lib/applications-state";
import { logger } from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("cerrar-postulaciones")
  .setDescription("Cierra las postulaciones para el rol de Trial Helper.");

(data as any).staffOnly = true;
(data as any).category = "Postulaciones";

const ROLES_AUTORIZADOS = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
];

async function hasStaffPermission(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guild || !interaction.user) return false;
  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member || !member.roles) return false;
    return ROLES_AUTORIZADOS.some((roleId) => member.roles.cache.has(roleId));
  } catch (err) {
    logger.error({ err }, "Error fetching member for permission check in /cerrar-postulaciones");
    return false;
  }
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const authorized = await hasStaffPermission(interaction);
  if (!authorized) {
    await interaction.reply({
      content:
        "❌ No tienes permiso para usar este comando. Se requiere un rango directivo/administrativo autorizado para gestionar las postulaciones.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  setApplicationsOpen(false);

  logger.info(
    { userId: interaction.user.id },
    "Applications closed via /cerrar-postulaciones",
  );

  const announcementEmbed = new EmbedBuilder()
    .setTitle("🔒 Las postulaciones están CERRADAS")
    .setColor("Red")
    .setDescription(
      "Las postulaciones para **Trial Helper** han sido cerradas.\n\n" +
        "Ya no es posible postularse en este momento. Estén atentos para cuando se vuelvan a abrir.",
    )
    .setTimestamp()
    .setFooter({ text: `Cerrado por ${interaction.user.username}` });

  try {
    await interaction.reply({ embeds: [announcementEmbed] });
  } catch (err) {
    logger.warn({ err }, "Could not send applications-closed announcement");
  }
}
