// /cerrar temporada & /cerrar postulaciones — Authorized roles only

import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { closeSeason } from "../services/SeasonService";
import { seasonRepository } from "../database/repositories/SeasonRepository";
import { logger } from "../lib/logger";

// ── Role IDs allowed to execute this command ──────────────────────────────
const ROLES_AUTORIZADOS = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1455419124732657801", // Equipo Administrativo
  "1522434536796061816", // Desarrollador
  "1453211902267228160", // Administrador
  "1509760475653472287", // Administrador [PB]
  "1522807097920720967", // Manager
];

async function hasPermission(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guild || !interaction.user) return false;
  try {
    const member = (interaction.member as GuildMember) || (await interaction.guild.members.fetch(interaction.user.id));
    if (!member || !member.roles) return false;

    return ROLES_AUTORIZADOS.some((roleId) => member.roles.cache.has(roleId));
  } catch (err) {
    logger.error({ err }, "Error checking permissions for /cerrar command");
    return false;
  }
}

// ── Command definition ─────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName("cerrar")
  .setDescription("Comandos de cierre (temporada o postulaciones).")
  .setDefaultMemberPermissions(PermissionFlagsBits.MentionEveryone)
  .addSubcommand((sub) =>
    sub
      .setName("temporada")
      .setDescription("Cierra la temporada ranked activa manualmente."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("postulaciones")
      .setDescription("Cierra el período de postulaciones al staff."),
  );

// ── Execute ────────────────────────────────────────────────────────────────
export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const authorized = await hasPermission(interaction);
  if (!authorized) {
    await interaction.reply({
      content: "❌ No tienes permiso para usar este comando. Se requiere un rango autorizado.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();

  // ── /cerrar temporada ───────────────────────────────────────────────────
  if (sub === "temporada") {
    await interaction.deferReply({ ephemeral: false });

    try {
      const current = await seasonRepository.findActive();
      if (!current) {
        await interaction.editReply(
          "❌ No hay ninguna temporada activa para cerrar.",
        );
        return;
      }

      await closeSeason(current.id, interaction.user.id);

      const embed = new EmbedBuilder()
        .setColor("Red")
        .setTitle("🔒 Temporada cerrada")
        .setImage(
          "https://i.postimg.cc/bvW9HyQg/Gemini-Generated-Image-2s3b992s3b992s3b.png",
        )
        .addFields(
          { name: "Nombre", value: current.nombre,        inline: true },
          { name: "ID",     value: String(current.id),    inline: true },
          {
            name:  "Fin",
            value: `<t:${Math.floor(Date.now() / 1000)}:D>`,
            inline: true,
          },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error({ err }, "Error in /cerrar temporada");
      const msg = err instanceof Error ? err.message : "Error desconocido.";
      await interaction.editReply(`❌ ${msg}`);
    }
  }

  // ── /cerrar postulaciones ───────────────────────────────────────────────
  else if (sub === "postulaciones") {
    await interaction.reply({
      content: "🔒 ¡El período de postulaciones al staff ha sido cerrado!",
      ephemeral: false,
    });
  }
}