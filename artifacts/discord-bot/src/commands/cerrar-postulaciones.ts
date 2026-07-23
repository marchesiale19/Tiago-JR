import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { setApplicationsOpen } from "../lib/applications-state";
import { logger } from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("cerrar-postulaciones")
  .setDescription("Cierra las postulaciones para el rol de Trial Helper.")
  // ManageRoles is assigned to Moderador [PB] and above in the server,
  // so Discord natively shows this command only to qualifying staff.
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

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

  setApplicationsOpen(false);

  logger.info(
    { userId: interaction.user.id },
    "Applications closed via /cerrar-postulaciones",
  );

  const announcementEmbed = new EmbedBuilder()
    .setTitle("Las postulaciones están CERRADAS")
    .setColor("Red")
    .setDescription(
      "Las postulaciones para Trial Helper han sido cerradas.\n\n" +
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
