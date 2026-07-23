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
  .setName("abrir-postulaciones")
  .setDescription("Abre las postulaciones para el rol de Trial Helper.")
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
      .setColor("Green")
      .setDescription(
        "Las postulaciones para el rol de **Trial Helper** han sido abiertas por el staff.\n\n" +
        "Usa el comando `/postular` para iniciar tu proceso de postulación por mensaje directo.\n\n" +
        "¡Mucha suerte a todos los participantes! 🍀",
      )
      .setTimestamp()
      .setFooter({ text: `Abierto por ${interaction.user.username}` });

    try {
      await (interaction.channel as TextChannel).send({ embeds: [announcementEmbed] });
    } catch (err) {
      logger.warn({ err }, "Could not send public applications-open announcement");
    }
  }
}
