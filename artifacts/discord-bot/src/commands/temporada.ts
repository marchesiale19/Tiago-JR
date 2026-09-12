import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { seasonRepository } from "../database/repositories/SeasonRepository";
import type { EstadisticaTemporada } from "@workspace/db";
import { logger } from "../lib/logger";

// Roles autorizados aurinha
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
  "1539368076326473868", // Developer Tiago Jr
];

async function hasPermission(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guild || !interaction.user) return false;
  try {
    const member = (interaction.member as GuildMember) || (await interaction.guild.members.fetch(interaction.user.id));
    if (!member || !member.roles) return false;

    return ROLES_AUTORIZADOS.some((roleId) => member.roles.cache.has(roleId));
  } catch (err) {
    logger.error({ err }, "Error checking permissions for /temporada info");
    return false;
  }
}

export const data = new SlashCommandBuilder()
  .setName("temporada")
  .setDescription("Información sobre las temporadas ranked.")
  .addSubcommand((sub) =>
    sub
      .setName("info")
      .setDescription("Muestra información de la temporada activa o de una pasada.")
      .addIntegerOption((opt) =>
        opt
          .setName("temporada")
          .setDescription("ID de la temporada que quieres consultar (por defecto: la activa)")
          .setRequired(false)
          .setMinValue(1),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const authorized = await hasPermission(interaction);
  if (!authorized) {
    await interaction.reply({
      content: "❌ No tienes permiso para usar este comando. Se requiere un rango autorizado.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: false });

  try {
    if (sub === "info") {
      const seasonId = interaction.options.getInteger("temporada");
      let current;

      if (seasonId === null) {
        current = await seasonRepository.findActive();
        if (!current) {
          await interaction.editReply("ℹ️ No hay ninguna temporada activa en este momento.");
          return;
        }
      } else {
        current = await seasonRepository.findById(seasonId);
        if (!current) {
          await interaction.editReply(`❌ No se encontró ninguna temporada con el ID **${seasonId}**.`);
          return;
        }
      }

      const topRows = await seasonRepository.leaderboard(current.id, 3);

      let podiumText = "`No hay registros en el ranking de esta temporada`";
      if (topRows.length > 0) {
        podiumText = topRows.map((row: EstadisticaTemporada, i: number) => {
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
          const winrate =
            row.partidasJugadas > 0
              ? ((row.victorias / row.partidasJugadas) * 100).toFixed(1)
              : "0.0";

          return `${medal} <@${row.discordId}> — \`${row.elo} ELO\` (${row.victorias}V/${row.derrotas}D - ${winrate}%)`;
        }).join("\n");
      }

      const statusText = current.activa ? "`🟢 En curso`" : "`🔴 Finalizada`";

      const embed = new EmbedBuilder()
        .setColor(current.activa ? "Orange" : "Red")
        .setTitle(`📅 Información de Temporada: ${current.nombre}`)
        .setDescription("Resumen detallado y podio final/actual de la etapa competitiva.")
        .addFields(
          { name: "Nombre", value: `\`${current.nombre}\``, inline: true },
          { name: "ID", value: `\`${current.id}\``, inline: true },
          { name: "Estado", value: statusText, inline: true },
          { 
            name: "Inicio", 
            value: `<t:${Math.floor(current.fechaInicio.getTime() / 1000)}:D>` + (current.activa ? ` (<t:${Math.floor(current.fechaInicio.getTime() / 1000)}:R>)` : ""), 
            inline: false 
          },
          { 
            name: current.activa ? "🏆 Podio Actual (Top 3 ELO)" : "🏆 Podio Final (Top 3 ELO)", 
            value: podiumText, 
            inline: false 
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  } catch (err) {
    logger.error({ err, sub }, "Error in /temporada command");
    const msg = err instanceof Error ? err.message : "Error desconocido.";
    await interaction.editReply(`❌ ${msg}`);
  }
}