import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { achievementService } from "../services/AchievementService";
import { logger } from "../lib/logger";

// ── Command definition ─────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName("logros")
  .setDescription("Muestra el catálogo de logros y el progreso de un jugador.")
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
    const targetUser  = interaction.options.getUser("jugador");
    const isSelf      = !targetUser || targetUser.id === interaction.user.id;
    const discordId   = isSelf ? interaction.user.id : targetUser!.id;
    const displayName = isSelf ? interaction.user.username : targetUser!.username;

    // Service owns all data coordination — command is purely a renderer
    const summary = await achievementService.getPlayerAchievementSummary(discordId);

    // ── Empty catalog ──────────────────────────────────────────────────────
    if (summary.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Orange")
            .setTitle(`🏆 Logros de ${displayName}`)
            .setDescription("No hay logros disponibles en el catálogo todavía.")
            .setImage("https://i.postimg.cc/pVg3Xv4S/Gemini-Generated-Image-sj6142sj6142sj61.png")
            .setTimestamp(),
        ],
      });
      return;
    }

    // ── Build achievement lines ────────────────────────────────────────────
    const unlockedCount = summary.filter((s) => s.unlocked).length;

    const lines = summary.map((item) => {
      const icon     = item.unlocked ? "✅" : "🔒";
      const progress = `Progreso: ${item.currentValue}/${item.requiredValue}`;
      return `${icon} **${item.nombre}**\n${item.descripcion}\n${progress}`;
    });

    // ── Embed construction ─────────────────────────────────────────────────
    // Split into chunks of 4 achievements per embed field to stay within Discord limits
    const CHUNK_SIZE = 4;
    const chunks: string[][] = [];
    for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
      chunks.push(lines.slice(i, i + CHUNK_SIZE));
    }

    const visibilityNote = isSelf ? "" : " (vista pública)";
    const headerFieldName = `Desbloqueados: ${unlockedCount}/${summary.length}${visibilityNote}`;

    const embed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle(`🏆 Logros de ${displayName}`)
      .setImage("https://i.postimg.cc/pVg3Xv4S/Gemini-Generated-Image-sj6142sj6142sj61.png")
      .setTimestamp();

    chunks.forEach((chunk, idx) => {
      embed.addFields({
        name:   idx === 0 ? headerFieldName : "​", // zero-width space for continuation fields
        value:  chunk.join("\n\n"),
        inline: false,
      });
    });

    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    logger.error({ err }, "Error in /logros command");
    const msg = err instanceof Error ? err.message : "Error desconocido.";
    await interaction.editReply(`❌ ${msg}`);
  }
}
