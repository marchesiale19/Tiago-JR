// /abrir temporada — Opens a new ranked season (Mod+ only)

import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { openSeason } from "../services/SeasonService";
import { logger } from "../lib/logger";

// ── Permission helper ──────────────────────────────────────────────────────
const ROL_REFERENCIA = "Moderador [PB]";

function hasModPermission(member: any): boolean {
  if (!member || typeof member !== "object") return false;
  if (!member.guild || !member.roles?.cache)  return false;

  const rolRef = member.guild.roles.cache.find(
    (r: any) => r.name === ROL_REFERENCIA,
  );
  if (!rolRef) return false;

  return (member.roles.highest as any).position >= (rolRef as any).position;
}

// ── Command definition ─────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName("abrir")
  .setDescription("Abre una temporada ranked.")
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
  );

// ── Execute ────────────────────────────────────────────────────────────────
export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const sub = interaction.options.getSubcommand();

  // Runtime permission check — Moderador [PB] or higher in the role hierarchy
  if (!hasModPermission(interaction.member)) {
    await interaction.reply({
      content:
        "❌ No tienes permiso para usar este comando. Se requiere el rango de **Moderador [PB]** o superior.",
      ephemeral: true,
    });
    return;
  }

  // ── /abrir temporada ────────────────────────────────────────────────────
  if (sub === "temporada") {
    await interaction.deferReply({ ephemeral: false }); // Visible to everyone

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
}