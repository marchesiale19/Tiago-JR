// /cerrar temporada & /cerrar postulaciones — Subcommand-based role permissions

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

// ── Role definitions ───────────────────────────────────────────────────────
const ROLES_POSTULACIONES = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1455419124732657801", // Equipo Administrativo
];

const ROLES_TEMPORADA = [
  ...ROLES_POSTULACIONES,
  "1522434536796061816", // Desarrollador
  "1453211902267228160", // Administrador
  "1509760475653472287", // Administrador [PB]
  "1522807097920720967", // Manager
];

async function hasSubcommandPermission(interaction: any, sub: string): Promise<boolean> {
  if (!interaction.guild || !interaction.user) return false;
  try {
    let member = interaction.member;

    if (!member || !member.roles || typeof member.roles.cache?.some !== 'function') {
      member = await interaction.guild.members.fetch(interaction.user.id);
    }

    if (!member || !member.roles) return false;

    const allowedRoles = sub === "postulaciones" ? ROLES_POSTULACIONES : ROLES_TEMPORADA;
    return allowedRoles.some((roleId) => member.roles.cache.has(roleId));
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
  const sub = interaction.options.getSubcommand();
  const authorized = await hasSubcommandPermission(interaction, sub);

  if (!authorized) {
    const errorMsg =
      sub === "postulaciones"
        ? "❌ No tienes permiso para cerrar postulaciones. Se requiere ser parte del Equipo Administrativo."
        : "❌ No tienes permiso para cerrar temporadas. Se requiere ser Manager o un rango superior.";

    await interaction.reply({
      content: errorMsg,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

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
        .setImage("https://i.postimg.cc/bvW9HyQg/Gemini-Generated-Image-2s3b992s3b992s3b.png")
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