import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { seasonRepository } from "../database/repositories/SeasonRepository";
import { logger }           from "../lib/logger";

// NOTE: /temporada abrir and /temporada cerrar were migrated to
// /abrir temporada and /cerrar temporada (abrir.ts / cerrar.ts).
// This file now only handles /temporada info.

export const data = new SlashCommandBuilder()
  .setName("temporada")
  .setDescription("Información sobre las temporadas ranked.")
  .addSubcommand((sub) =>
    sub
      .setName("info")
      .setDescription("Muestra información de la temporada activa."),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: false });

  try {
    if (sub === "info") {
      const current = await seasonRepository.findActive();
      if (!current) {
        await interaction.editReply("ℹ️ No hay ninguna temporada activa en este momento.");
        return;
      }

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Orange")
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
