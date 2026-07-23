import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  PermissionsBitField,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { setApplicationsOpen } from "../lib/applications-state";
import { logger } from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("cerrar-postulaciones")
  .setDescription("Cierra las postulaciones para el rol de Trial Helper.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

(data as any).staffOnly = true;
(data as any).category = "Postulaciones";

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const member = interaction.member;
  const hasPermission = Boolean(
    member &&
      "permissions" in member &&
      typeof member.permissions !== "string" &&
      (member.permissions as Readonly<PermissionsBitField>).has(
        PermissionFlagsBits.ManageRoles,
      ),
  );

  if (!hasPermission) {
    await interaction.reply({
      content: "No tienes permiso para usar este comando.",
      ephemeral: true,
    });
    return;
  }

  setApplicationsOpen(false);

  logger.info(
    { userId: interaction.user.id },
    "Applications closed via /cerrar-postulaciones",
  );

  // Confirmación privada al staff que ejecutó el comando
  await interaction.reply({
    content: "🔒 Las postulaciones para Trial Helper han sido CERRADAS.",
    ephemeral: true,
  });

  // Anuncio público en el canal donde se ejecutó el comando
  if (interaction.channel && "send" in interaction.channel) {
    const announcementEmbed = new EmbedBuilder()
      .setTitle("🔒 Las postulaciones están CERRADAS")
      .setColor("Red")
      .setDescription(
        "Las postulaciones para el rol de **Trial Helper** han sido cerradas por el staff.\n\n" +
        "Ya no es posible postularse en este momento. Estén atentos para cuando se vuelvan a abrir.",
      )
      .setTimestamp()
      .setFooter({ text: `Cerrado por ${interaction.user.username}` });

    try {
      await (interaction.channel as TextChannel).send({ embeds: [announcementEmbed] });
    } catch (err) {
      logger.warn({ err }, "Could not send public applications-closed announcement");
    }
  }
}
