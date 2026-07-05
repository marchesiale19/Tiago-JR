import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  PermissionsBitField,
  type ChatInputCommandInteraction,
} from "discord.js";
import { setApplicationsOpen } from "../lib/applications-state";
import { logger } from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("abrir-postulaciones")
  .setDescription("Abre las postulaciones para el rol de Trial Helper.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

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

  await interaction.reply({
    content: "✅ Las postulaciones para Trial Helper han sido ABIERTAS.",
    ephemeral: true,
  });
}
