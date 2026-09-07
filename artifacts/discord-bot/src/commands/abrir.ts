// /abrir temporada & /abrir postulaciones — Authorized roles only

import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { openSeason } from "../services/SeasonService";
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
    logger.error({ err }, "Error checking permissions for /abrir command");
    return false;
  }
}

// ── Command definition ─────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName("abrir")
  .setDescription("Comandos de apertura (temporada o postulaciones).")
  .setDefaultMemberPermissions(PermissionFlagsBits.MentionEveryone)
  .addSubcommand((sub) =>
    sub
      .setName("temporada")
      .setDescription(
        "Abre una nueva temporada ranked (cierra la activa si existe).",
      )
      .addStringOption((opt) =>
        opt
          .setName("nombre")
          .setDescription("Nombre de la nueva temporada")
          .setRequired(true)
          .setMaxLength(100),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("postulaciones")
      .setDescription("Abre el período de postulaciones al staff."),
  );

// ── Execute ────────────────────────────────────────────────────────────────
export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const authorized = await hasPermission(interaction);
  if (!authorized) {
    await interaction.reply({
      content: "❌ No tienes permiso para usar este comando. Se requiere ser Manager o un rango superior.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();

  // ── /abrir temporada ────────────────────────────────────────────────────
  if (sub === "temporada") {
    await interaction.deferReply({ ephemeral: false });

    try {
      const nombre = interaction.options.getString("nombre", true).trim();
      const result = await openSeason(nombre, interaction.user.id);

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setTitle("🏆 ¡Nueva temporada iniciada!")
        .setImage(
          "https://i.postimg.cc/jSRgLSX3/Gemini-Generated-Image-gf14dggf14dggf14.png",
        )
        .addFields(
          { name: "Nombre", value: result.opened.nombre,   inline: true },
          { name: "ID",     value: String(result.opened.id), inline: true },
          {
            name:   "Inicio",
            value:  `<t:${Math.floor(result.opened.fechaInicio.getTime() / 1000)}:D>`,
            inline: true,
          },
        )
        .setTimestamp();

      if (result.closed) {
        embed.addFields({
          name:   "⚙️ Temporada anterior cerrada automáticamente",
          value:  `"${result.closed.nombre}" (ID: ${result.closed.id})`,
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error({ err }, "Error in /abrir temporada");
      const msg = err instanceof Error ? err.message : "Error desconocido.";
      await interaction.editReply(`❌ ${msg}`);
    }
  }

  // ── /abrir postulaciones ────────────────────────────────────────────────
  else if (sub === "postulaciones") {
    await interaction.reply({
      content: "✅ ¡El período de postulaciones al staff ha sido abierto exitosamente!",
      ephemeral: false,
    });
  }
}