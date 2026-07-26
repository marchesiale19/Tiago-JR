import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { seasonRepository }       from "../database/repositories/SeasonRepository";
import type { EstadisticaTemporada } from "@workspace/db";
import { logger }                 from "../lib/logger";

const PAGE_SIZE = 10;

export const data = new SlashCommandBuilder()
  .setName("ranking")
  .setDescription("Muestra el ranking de jugadores de una temporada.")
  .addSubcommand((sub) =>
    sub
      .setName("activa")
      .setDescription("Ranking de la temporada activa.")
      .addIntegerOption((opt) =>
        opt
          .setName("pagina")
          .setDescription("Página del ranking (10 jugadores por página, por defecto 1)")
          .setMinValue(1),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("temporada")
      .setDescription("Ranking de una temporada específica.")
      .addIntegerOption((opt) =>
        opt.setName("id").setDescription("ID de la temporada").setRequired(true).setMinValue(1),
      )
      .addIntegerOption((opt) =>
        opt
          .setName("pagina")
          .setDescription("Página del ranking (10 jugadores por página, por defecto 1)")
          .setMinValue(1),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: false });

  try {
    let temporadaId:     number;
    let temporadaNombre: string;
    let temporadaActiva: boolean;

    if (sub === "activa") {
      const season = await seasonRepository.findActive();
      if (!season) {
        await interaction.editReply("ℹ️ No hay ninguna temporada activa en este momento.");
        return;
      }
      temporadaId     = season.id;
      temporadaNombre = season.nombre;
      temporadaActiva = true;
    } else {
      temporadaId = interaction.options.getInteger("id", true);
      const season = await seasonRepository.findById(temporadaId);
      if (!season) {
        await interaction.editReply(`❌ Temporada con ID **${temporadaId}** no encontrada.`);
        return;
      }
      temporadaNombre = season.nombre;
      temporadaActiva = season.activa;
    }

    const pagina = (interaction.options.getInteger("pagina") ?? 1) - 1; // 0-indexed offset

    // Fetch all rows once and paginate in memory (leaderboard is max 500 rows)
    const allRows    = await seasonRepository.leaderboard(temporadaId, 500);
    const total      = allRows.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const clampedPage = Math.min(pagina, totalPages - 1);
    const rows       = allRows.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

    if (rows.length === 0) {
      await interaction.editReply(
        `ℹ️ No hay estadísticas registradas para la temporada **${temporadaNombre}** aún.`,
      );
      return;
    }

    const lines = rows.map((row, i) =>
      formatRow(clampedPage * PAGE_SIZE + i + 1, row),
    );

    const statusTag = temporadaActiva ? "🟢 Activa" : "🔴 Cerrada";

    const embed = new EmbedBuilder()
      .setColor("Gold")
      .setTitle(`🏆 Ranking — ${temporadaNombre}`)
      .setDescription(lines.join("\n"))
      .setFooter({
        text: `Temporada ${temporadaId} (${statusTag}) • Página ${clampedPage + 1}/${totalPages} • ${total} jugadores`,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    logger.error({ err, sub }, "Error in /ranking command");
    const msg = err instanceof Error ? err.message : "Error desconocido.";
    await interaction.editReply(`❌ ${msg}`);
  }
}

/**
 * Format a single leaderboard row.
 * Winrate is computed on the fly: victorias / partidasJugadas.
 * The winrate column is NEVER stored in the database.
 */
function formatRow(rank: number, row: EstadisticaTemporada): string {
  const winrate =
    row.partidasJugadas > 0
      ? ((row.victorias / row.partidasJugadas) * 100).toFixed(1)
      : "0.0";

  const medal =
    rank === 1 ? "🥇" :
    rank === 2 ? "🥈" :
    rank === 3 ? "🥉" :
    `**${rank}.**`;

  return (
    `${medal} <@${row.discordId}> — **${row.elo} ELO** | ` +
    `${row.victorias}V / ${row.derrotas}D (${winrate}% WR) | ` +
    `${row.partidasJugadas} partidas`
  );
}
