import {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { setAvailable, setUnavailable } from "../services/SupervisorService";
import { supervisorRepository } from "../database/repositories/SupervisorRepository";
import { logger } from "../lib/logger";

// Require the Discord-native MuteMembers permission to see this command —
// matches the role matrix for Trial Helper and above.
export const data = new SlashCommandBuilder()
  .setName("supervisor")
  .setDescription("Gestiona tu disponibilidad como supervisor de partidas.")
  .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
  .addSubcommand((sub) =>
    sub.setName("disponible").setDescription("Márcate como disponible para supervisar partidas."),
  )
  .addSubcommand((sub) =>
    sub.setName("ocupado").setDescription("Márcate como no disponible para supervisar partidas."),
  )
  .addSubcommand((sub) =>
    sub.setName("estado").setDescription("Muestra tu estado actual de disponibilidad."),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  try {
    if (sub === "disponible") {
      await setAvailable(interaction.user.id);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Green")
            .setTitle("✅ Ahora estás disponible")
            .setDescription("Serás asignado a la próxima partida disponible según orden FIFO.")
            .setTimestamp(),
        ],
      });

    } else if (sub === "ocupado") {
      await setUnavailable(interaction.user.id);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setTitle("🔴 Ahora estás no disponible")
            .setDescription("No recibirás solicitudes de supervisión hasta que te marques como disponible.")
            .setTimestamp(),
        ],
      });

    } else if (sub === "estado") {
      const row = await supervisorRepository.findByDiscordId(interaction.user.id);
      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setTitle("📊 Tu estado de supervisor")
        .setTimestamp();

      if (!row) {
        embed.setDescription("No tienes ningún registro de supervisor aún. Usa `/supervisor disponible` para registrarte.");
      } else {
        embed.addFields(
          { name: "Disponible", value: row.disponible ? "✅ Sí" : "❌ No", inline: true },
          { name: "Ocupado",    value: row.ocupado    ? "🔴 Sí" : "✅ No", inline: true },
          { name: "Último cambio", value: `<t:${Math.floor(row.ultimoCambio.getTime() / 1000)}:R>`, inline: false },
        );
      }

      await interaction.editReply({ embeds: [embed] });
    }
  } catch (err) {
    logger.error({ err, sub }, "Error in /supervisor command");
    await interaction.editReply("❌ Ocurrió un error al procesar el comando.");
  }
}
