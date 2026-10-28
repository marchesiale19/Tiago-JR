import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Message,
  SlashCommandBuilder,
} from "discord.js";
import pkg from "unb-api";
const { Client: UnbClient } = pkg;
import { logger } from "../lib/logger";

const UNBELIEVABOAT_API_KEY = process.env["UNBELIEVABOAT_API_KEY"];
if (!UNBELIEVABOAT_API_KEY) {
  throw new Error("❌ Falta la variable de entorno UNBELIEVABOAT_API_KEY.");
}
const unb = new UnbClient(UNBELIEVABOAT_API_KEY);

const ROLES_ADMIN_AUTORIZADOS = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1522434536796061816", // Desarrollador
  "1503876451315880016", // Administrador
  "1509760475653472287", // Administrador [PB]
  "1522807097920720967", // Manager
];

async function ejecutarResetCasino(guildId: string): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const leaderboardData = await unb.getGuildLeaderboard(guildId, { limit: 100 });
    const users = Array.isArray(leaderboardData) ? leaderboardData : (leaderboardData as any)?.users ?? [];

    if (!users || users.length === 0) {
      return { success: false, count: 0, error: "No se encontraron usuarios en el leaderboard del casino para resetear." };
    }

    let count = 0;
    for (const userData of users) {
      const userId = userData?.user_id ?? userData?.id;
      if (!userId) continue;

      try {
        await unb.setUserBalance(guildId, userId, { cash: 0, bank: 0 });
        count++;
      } catch (userErr) {
        logger.warn({ userErr, userId }, "No se pudo resetear el balance de un usuario específico en el casino.");
      }
    }

    return { success: true, count };
  } catch (err: any) {
    logger.error({ err, guildId }, "Error crítico al ejecutar el reset del casino.");
    return { success: false, count: 0, error: err?.message || "Error desconocido" };
  }
}

export const data = new SlashCommandBuilder()
  .setName("resetcasino")
  .setDescription("⚠️ [ADMIN] Resetea y deja en 0 el balance del casino de todos los usuarios.");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "❌ Este comando solo se puede usar en servidores.", ephemeral: true });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const tienePermiso = member?.roles.cache.some((role) => ROLES_ADMIN_AUTORIZADOS.includes(role.id));

  if (!tienePermiso) {
    await interaction.reply({ content: "❌ No tenés permisos para usar este comando destructivo.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const resultado = await ejecutarResetCasino(interaction.guildId);

  if (!resultado.success) {
    await interaction.editReply(`❌ Ocurrió un error al resetear el casino: \`${resultado.error}\``);
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle("⚠️ Casino Reseteado")
    .setDescription(`El casino ha sido reiniciado por <@${interaction.user.id}>.`)
    .addFields({ name: "📊 Usuarios afectados", value: `\`${resultado.count}\``, inline: true })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

export async function run(message: Message, _args: string[]): Promise<void> {
  if (!message.guildId || !message.guild) {
    await message.reply("❌ Este comando solo se puede usar en servidores.");
    return;
  }

  const member = await message.guild.members.fetch(message.author.id).catch(() => null);
  const tienePermiso = member?.roles.cache.some((role) => ROLES_ADMIN_AUTORIZADOS.includes(role.id));

  if (!tienePermiso) {
    await message.reply("❌ No tenés permisos para usar este comando destructivo.");
    return;
  }

  const processingMsg = await message.reply("⏳ Procesando reseteo del casino para todos los usuarios... Por favor espera.");

  const resultado = await ejecutarResetCasino(message.guildId);

  if (!resultado.success) {
    await processingMsg.edit(`❌ Ocurrió un error al resetear el casino: \`${resultado.error}\``);
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle("⚠️ Casino Reseteado")
    .setDescription(`El casino ha sido reiniciado por <@${message.author.id}>.`)
    .addFields({ name: "📊 Usuarios afectados", value: `\`${resultado.count}\``, inline: true })
    .setTimestamp();

  await processingMsg.edit({ content: null, embeds: [embed] });
}
