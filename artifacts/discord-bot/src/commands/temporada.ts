import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { seasonRepository } from "../database/repositories/SeasonRepository";
import { logger } from "../lib/logger";

// IDs de roles autorizados para usar /temporada info
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
      .setDescription("Muestra información de la temporada activa."),
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