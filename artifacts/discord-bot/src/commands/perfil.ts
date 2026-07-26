import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getPlayerProfile } from "../services/ProfileService";
import { logger }           from "../lib/logger";

// ── ELO motivo labels ──────────────────────────────────────────────────────
const MOTIVO_LABEL: Record<string, string> = {
  victory:         "Victoria",
  defeat:          "Derrota",
  abandon:         "Abandono",
  expulsion:       "Expulsión",
  staff_reversion: "Corrección staff",
  season_reset:    "Reset de temporada",
};

// ── Match result helpers ───────────────────────────────────────────────────
function matchResultLabel(status: string, ganadorEquipo: number | null, equipo: number): string {
  if (status === "cancelled") return "❌ Cancelada";
  if (status !== "closed")    return "⏳ En curso";
  if (ganadorEquipo === null)  return "⚖️ Empate";
  return ganadorEquipo === equipo ? "✅ Victoria" : "❌ Derrota";
}

function rolLabel(rol: string | null): string {
  if (rol === "impostor")   return "🔴 Impostor";
  if (rol === "tripulante") return "🔵 Tripulante";
  return "❓ Sin rol";
}

// ── Command definition ─────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName("perfil")
  .setDescription("Muestra el perfil competitivo de un jugador.")
  .addUserOption((opt) =>
    opt
      .setName("jugador")
      .setDescription("Jugador a consultar (por defecto: tú mismo)")
      .setRequired(false),
  );

// ── Execute ────────────────────────────────────────────────────────────────
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: false });

  try {
    const target     = interaction.options.getUser("jugador") ?? interaction.user;
    const discordId  = target.id;
    const displayTag = target.username;

    const profile = await getPlayerProfile(discordId);

    // ── No data at all ────────────────────────────────────────────────────
    if (!profile.user && profile.eloHistory.length === 0 && profile.recentMatches.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Gold")
            .setTitle(`👤 Perfil — ${displayTag}`)
            .setDescription("Este jugador aún no tiene estadísticas registradas.")
            .setTimestamp(),
        ],
      });
      return;
    }

    // ── Season stats section ──────────────────────────────────────────────
    const stats = profile.seasonStats;
    let seasonSection: string;

    if (!profile.seasonName) {
      seasonSection = "_Sin temporada activa._";
    } else if (!stats) {
      seasonSection = `_Sin partidas en **${profile.seasonName}** aún._`;
    } else {
      const winrate =
        stats.partidasJugadas > 0
          ? ((stats.victorias / stats.partidasJugadas) * 100).toFixed(1)
          : "0.0";

      const rankStr = profile.leaderboardPosition
        ? `**#${profile.leaderboardPosition}**`
        : "Sin clasificar";

      seasonSection = [
        `**Temporada:** ${profile.seasonName}`,
        `**ELO:** ${stats.elo} | **Posición:** ${rankStr}`,
        `**Partidas:** ${stats.partidasJugadas} | **Victorias:** ${stats.victorias} | **Derrotas:** ${stats.derrotas}`,
        `**WR:** ${winrate}% | **MVP:** ${stats.mvpCount}`,
      ].join("\n");
    }

    // ── ELO history section ───────────────────────────────────────────────
    let eloSection: string;

    if (profile.eloHistory.length === 0) {
      eloSection = "_Sin cambios de ELO registrados._";
    } else {
      eloSection = profile.eloHistory
        .map((h) => {
          const delta  = h.eloNuevo - h.eloAnterior;
          const sign   = delta >= 0 ? "+" : "";
          const motivo = MOTIVO_LABEL[h.motivo] ?? h.motivo;
          const ts     = Math.floor(h.createdAt.getTime() / 1000);
          return `<t:${ts}:d> ${motivo} → **${h.eloNuevo}** (${sign}${delta})`;
        })
        .join("\n");
    }

    // ── Recent matches section ────────────────────────────────────────────
    let matchSection: string;

    if (profile.recentMatches.length === 0) {
      matchSection = "_Sin partidas recientes._";
    } else {
      matchSection = profile.recentMatches
        .map((m) => {
          const result = matchResultLabel(m.status, m.ganadorEquipo, m.equipo);
          const rol    = rolLabel(m.rol);
          const ts     = Math.floor(m.createdAt.getTime() / 1000);
          return `<t:${ts}:d> ${result} | ${rol} | \`${m.id.slice(0, 8)}\``;
        })
        .join("\n");
    }

    // ── Global ELO footer note ────────────────────────────────────────────
    const globalElo = profile.user?.elo ?? "—";

    const embed = new EmbedBuilder()
      .setColor("Gold")
      .setTitle(`👤 Perfil — ${displayTag}`)
      .addFields(
        { name: "📊 Temporada activa",    value: seasonSection,  inline: false },
        { name: "📈 Historial ELO (x5)",  value: eloSection,     inline: false },
        { name: "🎮 Partidas recientes",  value: matchSection,   inline: false },
      )
      .setFooter({ text: `ELO global: ${globalElo} | ID: ${discordId}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    logger.error({ err }, "Error in /perfil command");
    const msg = err instanceof Error ? err.message : "Error desconocido.";
    await interaction.editReply(`❌ ${msg}`);
  }
}
