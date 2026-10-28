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

// IDs oficiales de las Mr Lucky en UnbelievaBoat
const LUCKYBOX_ITEM_IDS = [
  "1545211721772305804", // Mr Lucky Común
  "1548866970819101248", // Mr Lucky Raro
  "1461518959055602890", // Mr Lucky Épico
  "1461563297299040148", // Mr Lucky Admin
];

async function ejecutarResetInventarioLucky(guildId: string): Promise<{ success: boolean; totalRemovidos: number; usuariosAfectados: number; error?: string }> {
  try {
    // Ampliamos el límite a 1000 para abarcar a la gran mayoría de usuarios del servidor
    const leaderboardData = await unb.getGuildLeaderboard(guildId, { limit: 1000 });
    const users = Array.isArray(leaderboardData) ? leaderboardData : (leaderboardData as any)?.users ?? [];

    if (!users || users.length === 0) {
      return { success: false, totalRemovidos: 0, usuariosAfectados: 0, error: "No se encontraron usuarios para escanear inventarios." };
    }

    let totalRemovidos = 0;
    let usuariosAfectados = 0;

    for (const userData of users) {
      const userId = userData?.user_id ?? userData?.id;
      if (!userId) continue;

      try {
        const inventoryResult = await unb.getInventoryItems(guildId, userId);
        const items = (inventoryResult as any)?.items ?? [];

        if (!Array.isArray(items) || items.length === 0) continue;

        let userTieneLuckyboxes = false;

        for (const item of items) {
          const itemId = String(item.item_id ?? item.itemId ?? item.id ?? "");
          const quantity = Number(item.quantity ?? item.quantiy ?? item.count ?? 0);

          if (LUCKYBOX_ITEM_IDS.includes(itemId) && quantity > 0) {
            await unb.removeInventoryItem(guildId, userId, itemId, quantity);
            totalRemovidos += quantity;
            userTieneLuckyboxes = true;
          }
        }

        if (userTieneLuckyboxes) {
          usuariosAfectados++;
        }
      } catch (userErr) {
        logger.warn({ userErr, userId }, "No se pudo limpiar el inventario de un usuario específico.");
      }
    }

    return { success: true, totalRemovidos, usuariosAfectados };
  } catch (err: any) {
    logger.error({ err, guildId }, "Error crítico al ejecutar el reseteo masivo de inventarios.");
    return { success: false, totalRemovidos: 0, usuariosAfectados: 0, error: err?.message || "Error desconocido" };
  }
}

export const data = new SlashCommandBuilder()
  .setName("resetinv")
  .setDescription("⚠️ [ADMIN] Remueve todas las cajas Mr Lucky de los inventarios de los usuarios de forma masiva.");

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

  const resultado = await ejecutarResetInventarioLucky(interaction.guildId);

  if (!resultado.success) {
    await interaction.editReply(`❌ Ocurrió un error al limpiar los inventarios: \`${resultado.error}\``);
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle("⚠️ Inventarios de Luckybox Reseteados (Masivo)")
    .setDescription(`Todas las cajas Mr Lucky fueron retiradas de los inventarios por <@${interaction.user.id}>.`)
    .addFields(
      { name: "📦 Cajas eliminadas en total", value: `\`${resultado.totalRemovidos}\``, inline: true },
      { name: "👤 Usuarios afectados", value: `\`${resultado.usuariosAfectados}\``, inline: true }
    )
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

  const processingMsg = await message.reply("⏳ Escaneando masivamente los inventarios del servidor... Esto puede tardar unos segundos.");

  const resultado = await ejecutarResetInventarioLucky(message.guildId);

  if (!resultado.success) {
    await processingMsg.edit(`❌ Ocurrió un error al limpiar los inventarios: \`${resultado.error}\``);
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle("⚠️ Inventarios de Luckybox Reseteados (Masivo)")
    .setDescription(`Todas las cajas Mr Lucky fueron retiradas de los inventarios por <@${message.author.id}>.`)
    .addFields(
      { name: "📦 Cajas eliminadas en total", value: `\`${resultado.totalRemovidos}\``, inline: true },
      { name: "👤 Usuarios afectados", value: `\`${resultado.usuariosAfectados}\``, inline: true }
    )
    .setTimestamp();

  await processingMsg.edit({ content: null, embeds: [embed] });
}
