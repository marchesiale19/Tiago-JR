// /cerrar temporada    — Closes the active ranked season  (Mod+ only)
// /cerrar postulaciones — Closes staff applications       (Mod+ only)

import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { closeSeason }         from "../services/SeasonService";
import { seasonRepository }    from "../database/repositories/SeasonRepository";
import { setApplicationsOpen } from "../lib/applications-state";
import { logger }              from "../lib/logger";

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
  .setName("cerrar")
  .setDescription("Cierra una temporada o el período de postulaciones.")
  .setDefaultMemberPermissions(PermissionFlagsBits.MentionEveryone)
  .addSubcommand((sub) =>
    sub
      .setName("temporada")
      .setDescription("Cierra la temporada ranked activa manualmente."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("postulaciones")
      .setDescription("Cierra las postulaciones para el rol de Trial Helper."),
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

  // ── /cerrar temporada ───────────────────────────────────────────────────
  if (sub === "temporada") {
    await interaction.deferReply({ ephemeral: false }); // Visible to everyone (PATCH 18)

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

  // ── /cerrar postulaciones ───────────────────────────────────────────────
  } else if (sub === "postulaciones") {
    setApplicationsOpen(false);

    logger.info(
      { userId: interaction.user.id },
      "Applications closed via /cerrar postulaciones",
    );

    const embed = new EmbedBuilder()
      .setTitle("🔒 Las postulaciones están CERRADAS")
      .setColor("Red")
      .setDescription(
        "Las postulaciones para **Trial Helper** han sido cerradas.\n\n" +
          "Ya no es posible postularse en este momento. Estén atentos para cuando se vuelvan a abrir.",
      )
      .setTimestamp()
      .setFooter({ text: `Cerrado por ${interaction.user.username}` });

    try {
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      logger.warn({ err }, "Could not send applications-closed announcement");
    }
  }
}
