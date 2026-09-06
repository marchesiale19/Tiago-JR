import {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import { syncTopCasinoRole } from "./luckybox"; // Importamos la función desde luckybox

const ROLES_AUTORIZADOS = [
  "1522807097920720967", // Manager
  "1509760475653472287", // Admin-pb
  "1453211902267228160", // Admin
  "1522434536796061816", // Desarrollador
  "1485101671875874997", // Admin Elite
  "1512634750152478851", // Jefe staff
  "1508266687689003039", // Co-owner
  "1451383215603585140", // Owner
];

function tienePermisoSync(member: any): boolean {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  return ROLES_AUTORIZADOS.some((roleId) => member.roles?.cache?.has(roleId));
}

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Gestiona la clasificación y sincronización de roles del Casino.")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("sync")
      .setDescription("Sincroniza manualmente el Top 10 del Casino y sus roles (Staff Autorizado).")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "Este comando solo se usa en servidores.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "sync") {
    if (!tienePermisoSync(interaction.member)) {
      await interaction.reply({ content: "❌ No tienes los permisos ni roles necesarios para usar este comando.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ flags: 64 });
    const result = await syncTopCasinoRole(interaction.guild);

    const embed = new EmbedBuilder().setTitle("📊 Sincronización de Top Casino").setTimestamp();
    if (result.success) {
      embed.setColor("Green")
        .setDescription("¡El rol del Top 10 se ha sincronizado correctamente!")
        .addFields(
          { name: "✨ Roles Añadidos", value: `${result.added} usuarios`, inline: true },
          { name: "🔻 Roles Retirados", value: `${result.removed} usuarios`, inline: true }
        );
    } else {
      embed.setColor("Red").setDescription(`❌ Error: \`${result.error}\``);
    }
    await interaction.editReply({ embeds: [embed] });
  }
}

export async function run(message: Message, args: string[]): Promise<void> {
  if (!message.guildId || !message.guild) {
    await message.reply("Este comando solo se usa en servidores.");
    return;
  }

  const sub = (args[0] || "").toLowerCase();
  if (sub === "sync") {
    if (!tienePermisoSync(message.member)) {
      await message.reply("❌ No tienes los permisos ni roles necesarios para usar este comando.");
      return;
    }

    const channel: any = message.channel;
    await channel.send("🔄 Sincronizando el Top 10 del Casino...");
    const result = await syncTopCasinoRole(message.guild);

    const embed = new EmbedBuilder().setTitle("📊 Sincronización de Top Casino").setTimestamp();
    if (result.success) {
      embed.setColor("Green")
        .setDescription("¡El rol del Top 10 se ha sincronizado correctamente!")
        .addFields(
          { name: "✨ Roles Añadidos", value: `${result.added} usuarios`, inline: true },
          { name: "🔻 Roles Retirados", value: `${result.removed} usuarios`, inline: true }
        );
    } else {
      embed.setColor("Red").setDescription(`❌ Error: \`${result.error}\``);
    }
    await channel.send({ embeds: [embed] });
  }
}