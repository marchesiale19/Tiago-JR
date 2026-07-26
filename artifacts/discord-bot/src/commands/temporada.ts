import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { openSeason, closeSeason } from "../services/SeasonService";
import { seasonRepository }        from "../database/repositories/SeasonRepository";
import { logger }                  from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("temporada")
  .setDescription("Gestiona las temporadas competitivas.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("abrir")
      .setDescription("Abre una nueva temporada (cierra automáticamente la activa si existe).")
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
      .setName("cerrar")
      .setDescription("Cierra la temporada activa manualmente."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("info")
      .setDescription("Muestra información de la temporada activa."),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  try {
    // ── Abrir ──────────────────────────────────────────────────────────────
    if (sub === "abrir") {
      const nombre = interaction.options.getString("nombre", true).trim();
      const result = await openSeason(nombre, interaction.user.id);

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setTitle("🏆 Nueva temporada iniciada")
        .addFields(
          { name: "Nombre", value: result.opened.nombre,    inline: true },
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

    // ── Cerrar ─────────────────────────────────────────────────────────────
    } else if (sub === "cerrar") {
      const current = await seasonRepository.findActive();
      if (!current) {
        await interaction.editReply("❌ No hay ninguna temporada activa para cerrar.");
        return;
      }

      await closeSeason(current.id, interaction.user.id);

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setTitle("🔒 Temporada cerrada")
            .addFields(
              { name: "Nombre", value: current.nombre,        inline: true },
              { name: "ID",     value: String(current.id),    inline: true },
              { name: "Fin",    value: `<t:${Math.floor(Date.now() / 1000)}:D>`, inline: true },
            )
            .setTimestamp(),
        ],
      });

    // ── Info ───────────────────────────────────────────────────────────────
    } else if (sub === "info") {
      const current = await seasonRepository.findActive();
      if (!current) {
        await interaction.editReply("ℹ️ No hay ninguna temporada activa en este momento.");
        return;
      }

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Blue")
            .setTitle("📅 Temporada activa")
            .addFields(
              { name: "Nombre", value: current.nombre,        inline: true },
              { name: "ID",     value: String(current.id),    inline: true },
              {
                name:   "Inicio",
                value:  `<t:${Math.floor(current.fechaInicio.getTime() / 1000)}:D>`,
                inline: true,
              },
            )
            .setTimestamp(),
        ],
      });
    }

  } catch (err) {
    logger.error({ err, sub }, "Error in /temporada command");
    const msg = err instanceof Error ? err.message : "Error desconocido.";
    await interaction.editReply(`❌ ${msg}`);
  }
}
