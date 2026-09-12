// Aguante Boca


import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { openSeason } from "../services/SeasonService";
import { logger } from "../lib/logger";

// Definición de roles

const ROLES_POSTULACIONES = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1455419124732657801", // Equipo Administrativo
  "1539368076326473868", // Developer Tiago Jr
];

const ROLES_TEMPORADA = [
  ...ROLES_POSTULACIONES,
  "1522434536796061816", // Desarrollador
  "1453211902267228160", // Administrador
  "1509760475653472287", // Administrador [PB]
  "1522807097920720967", // Manager
];

async function hasSubcommandPermission(interaction: any, sub: string): Promise<boolean> {
  if (!interaction.guild || !interaction.user) return false;
  try {
    let member = interaction.member;

    if (!member || !member.roles || typeof member.roles.cache?.some !== 'function') {
      member = await interaction.guild.members.fetch(interaction.user.id);
    }

    if (!member || !member.roles) return false;

    const allowedRoles = sub === "postulaciones" ? ROLES_POSTULACIONES : ROLES_TEMPORADA;
    return allowedRoles.some((roleId) => member.roles.cache.has(roleId));
  } catch (err) {
    logger.error({ err }, "Error checking permissions for /abrir command");
    return false;
  }
}

// Definición de comandos

export const data = new SlashCommandBuilder()
  .setName("abrir")
  .setDescription("Comandos de apertura (temporada o postulaciones).")
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
  )
  .addSubcommand((sub) =>
    sub
      .setName("postulaciones")
      .setDescription("Abre el período de postulaciones al staff."),
  );

// Execute aura pro sahur

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const authorized = await hasSubcommandPermission(interaction, sub);

  if (!authorized) {
    const errorMsg =
      sub === "postulaciones"
        ? "❌ No tienes permiso para abrir postulaciones."
        : "❌ No tienes permiso para abrir temporadas.";

    await interaction.reply({
      content: errorMsg,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

// Abrir temporada

  if (sub === "temporada") {
    await interaction.deferReply({ ephemeral: false });

    try {
      const rawNombre = interaction.options.getString("nombre");
      if (!rawNombre) {
        await interaction.editReply("❌ Debes especificar el nombre de la temporada. Ejemplo: `-abrir temporada Temporada 1`");
        return;
      }
      const nombre = rawNombre.trim();
      const result = await openSeason(nombre, interaction.user.id);

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setTitle("🏆 ¡Nueva temporada iniciada!")
        .setDescription("¡Se ha dado inicio de manera oficial a una nueva etapa competitiva! Prepárense, den lo mejor de ustedes y que comience la pelea por la cima.")
        .setImage("https://i.postimg.cc/jSRgLSX3/Gemini-Generated-Image-gf14dggf14dggf14.png")
        .addFields(
          { name: "Nombre", value: `\`${result.opened.nombre}\``,   inline: true },
          { name: "ID",     value: `\`${result.opened.id}\``, inline: true },
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
          value:  `\`${result.closed.nombre}\` (ID: \`${result.closed.id}\`)`,
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

// Abrir postulaciones

  else if (sub === "postulaciones") {
    const embed = new EmbedBuilder()
      .setColor("Green") 
      .setTitle("📝 ¡Postulaciones al Staff Abiertas!")
      .setDescription("¡El período de postulaciones para formar parte del STAFF ya se encuentra oficialmente abierto! Si quieres postularte y aportar a la comunidad, usa el comando ``-postular`` para iniciar el proceso.")
      .setImage("https://i.postimg.cc/bvW9HyQg/Gemini-Generated-Image-2s3b992s3b992s3b.png") 
      .addFields(
        { name: "Estado", value: "`Abierto`", inline: true },
        { name: "Fecha de apertura", value: `<t:${Math.floor(Date.now() / 1000)}:D>`, inline: true },
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
    });
  }
}