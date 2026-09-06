import {
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
  type Message,
} from "discord.js";
import pkg from "unb-api";
const { Client: UnbClient } = pkg;
import { logger } from "../lib/logger";

const unb = new UnbClient(process.env.UNBELIEVABOAT_API_KEY as string);

export const ROL_TOP_CASINO_ID = "1546068235072442398";

export const COMMON_LUCKYBOX_REWARDS = [
  { texto: "45,000 Frijoles", valor: 45000, tipo: "positivo", probabilidad: "25.0%" },
  { texto: "60,000 Frijoles", valor: 60000, tipo: "positivo", probabilidad: "20.0%" },
  { texto: "65,000 Frijoles", valor: 65000, tipo: "positivo", probabilidad: "15.0%" },
  { texto: "80,000 Frijoles", valor: 80000, tipo: "positivo", probabilidad: "8.0%" },
  { texto: "100,000 Frijoles", valor: 100000, tipo: "positivo", probabilidad: "3.0%" },
  { texto: "-20,000 Frijoles", valor: -20000, tipo: "negativo", probabilidad: "20.0%" },
  { texto: "-25,000 Frijoles", valor: -25000, tipo: "negativo", probabilidad: "9.0%" },
] as const;

export function pickReward() {
  const rand = Math.random() * 100;
  let acumulado = 0;
  const probabilidadesNumericas = [25.0, 20.0, 15.0, 8.0, 3.0, 20.0, 9.0];

  for (let i = 0; i < COMMON_LUCKYBOX_REWARDS.length; i++) {
    acumulado += probabilidadesNumericas[i];
    if (rand <= acumulado) {
      return COMMON_LUCKYBOX_REWARDS[i];
    }
  }
  return COMMON_LUCKYBOX_REWARDS[0];
}

export async function syncTopCasinoRole(guild: Guild): Promise<{ success: boolean; added: number; removed: number; error?: string }> {
  try {
    const leaderboardData = await unb.getGuildLeaderboard(guild.id, { limit: 10 });
    const topUsers = Array.isArray(leaderboardData) ? leaderboardData : (leaderboardData as any)?.users || [];

    if (!topUsers || topUsers.length === 0) {
      return { success: false, added: 0, removed: 0, error: "Leaderboard vacía o no disponible." };
    }

    const topUserIds = new Set(topUsers.map((u: any) => u.user_id || u.id));
    const role = await guild.roles.fetch(ROL_TOP_CASINO_ID);

    if (!role) {
      return { success: false, added: 0, removed: 0, error: "El rol Top Casino no existe en este servidor." };
    }

    await guild.members.fetch();

    let addedCount = 0;
    let removedCount = 0;

    for (const [memberId, member] of role.members) {
      if (!topUserIds.has(memberId)) {
        await member.roles.remove(role, "Ya no forma parte del Top 10 del Casino.");
        removedCount++;
      }
    }

    for (const userData of topUsers) {
      const userId = userData.user_id || userData.id;
      try {
        const member = await guild.members.fetch(userId);
        if (member && !member.roles.cache.has(ROL_TOP_CASINO_ID)) {
          await member.roles.add(role, "¡Entró al Top 10 del Casino!");
          addedCount++;
        }
      } catch (err) {
        logger.warn({ userId, err }, "No se pudo actualizar el rol de casino para un usuario del top.");
      }
    }

    return { success: true, added: addedCount, removed: removedCount };
  } catch (err: any) {
    logger.error({ err, guildId: guild.id }, "Error al sincronizar el rol del Top Casino");
    return { success: false, added: 0, removed: 0, error: err?.message || "Error desconocido" };
  }
}

let isIntervalStarted = false;
function startAutoSync(clientInstance: any) {
  if (isIntervalStarted || !clientInstance) return;
  isIntervalStarted = true;

  setInterval(async () => {
    try {
      for (const [, guild] of clientInstance.guilds.cache) {
        await syncTopCasinoRole(guild);
      }
    } catch (e) {
      logger.error({ e }, "Error en el intervalo automático de syncTopCasinoRole");
    }
  }, 1000 * 60 * 60);
}

export const data = new SlashCommandBuilder()
  .setName("luckybox")
  .setDescription("Gestiona y abre tus cajas Mr lucky.")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("abrir")
      .setDescription("Abre un Mr lucky si lo tienes en tu inventario.")
      .addStringOption((option) =>
        option
          .setName("caja")
          .setDescription("Tipo de Mr lucky a abrir")
          .setRequired(true)
          .addChoices({ name: "Mr lucky Común", value: "Mr lucky Común" }),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("info")
      .setDescription("Muestra la información y recompensas posibles del Mr lucky Común.")
      .addStringOption((option) =>
        option
          .setName("caja")
          .setDescription("Tipo de caja para ver información")
          .setRequired(true)
          .addChoices({ name: "Mr lucky Común", value: "Mr lucky Común" }),
      ),
  );

async function handleInfo(sendReply: (options: any) => Promise<any>, cajaNombre: string) {
  const positivos = COMMON_LUCKYBOX_REWARDS.filter((r) => r.tipo === "positivo")
    .map((r) => `• **${r.texto}** — \`${r.probabilidad}\``)
    .join("\n");

  const negativos = COMMON_LUCKYBOX_REWARDS.filter((r) => r.tipo === "negativo")
    .map((r) => `• **${r.texto}** — \`${r.probabilidad}\``)
    .join("\n");

  const infoEmbed = new EmbedBuilder()
    .setColor("Orange")
    .setTitle(`📊 Información de Recompensas: ${cajaNombre}`)
    .setDescription(`Listado de premios y castigos posibles al abrir un **${cajaNombre}**, con sus respectivas probabilidades de obtención:`)
    .addFields(
      { name: "✨ Recompensas Positivas", value: positivos, inline: false },
      { name: "⚠️ Recompensas Negativas (Castigos)", value: negativos, inline: false },
    )
    .setFooter({ text: "Sistema de Mr Lucky • Probabilidades Oficiales" })
    .setTimestamp();

  await sendReply({ embeds: [infoEmbed] });
}

async function handleAbrir(
  sendReply: (options: any) => Promise<any>,
  sendChannelMessage: (options: any) => Promise<any>,
  guildId: string,
  targetUser: any,
  cajaNombre: string
) {
  try {
    const response = await (fetch as any)(`https://unbelievaboat.com/api/v1/guilds/${guildId}/users/${targetUser.id}/inventory`, {
      headers: {
        Authorization: process.env.UNBELIEVABOAT_API_KEY as string,
        Accept: "application/json",
      },
    });

    let items: any[] = [];
    if (response.ok) {
      const inventoryData: any = await response.json();
      items = inventoryData.items || inventoryData || [];
    } else if (response.status !== 404) {
      items = [];
    }

    const userBox = items.find((item: any) => {
      const itemName = (item.name || item.item_name || item.item_id || "").toLowerCase();
      const targetQuery = cajaNombre.toLowerCase();
      const hasQuantity = (item.quantity ?? item.quantiy ?? item.count ?? 1) > 0;
      return itemName.includes(targetQuery) && hasQuantity;
    });

    if (!userBox) {
      await sendReply({ content: `❌ No tienes ningún **${cajaNombre}** en tu inventario.` });
      return;
    }

    await (fetch as any)(`https://unbelievaboat.com/api/v1/guilds/${guildId}/users/${targetUser.id}/inventory/${userBox.item_id || userBox.id}`, {
      method: "DELETE",
      headers: {
        Authorization: process.env.UNBELIEVABOAT_API_KEY as string,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ quantity: 1 }),
    }).catch(() => {});

    const rewardObj = pickReward();
    await unb.editUserBalance(guildId, targetUser.id, { cash: rewardObj.valor });

    const embed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle(`🎁 ${cajaNombre} Abierto`)
      .setDescription(`¡<@${targetUser.id}> abrió su **${cajaNombre}**!`)
      .addFields(
        { name: "📦 Tipo de Item", value: `\`${cajaNombre}\``, inline: true },
        { name: "🎉 Premio obtenido", value: ` ${rewardObj.texto}`, inline: false },
        { name: "💸 Estado", value: `El item fue validado del inventario y los **${rewardObj.texto}** fueron aplicados a tu cuenta.`, inline: false },
      )
      .setFooter({ text: "Sistema de Mr Lucky • Inventario Verificado" })
      .setTimestamp();

    await sendReply({ content: `✅ ¡Mr lucky abierto con éxito!` });
    await sendChannelMessage({ embeds: [embed] });
  } catch (err: any) {
    logger.error({ err, targetUserId: targetUser.id }, "Error validating inventory for mr lucky");
    await sendReply({ content: `❌ **Error al verificar el inventario:** \`${err?.message || "Error desconocido"}\`` });
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.client) startAutoSync(interaction.client);

  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "Este comando solo se usa en servidores.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand() || "abrir";
  const cajaNombre = interaction.options.getString("caja", true);

  if (subcommand === "info") {
    await interaction.deferReply({ flags: 64 });
    await handleInfo((opts) => interaction.editReply(opts), cajaNombre);
    return;
  }

  await interaction.deferReply({ flags: 64 });
  const channel: any = interaction.channel;

  await handleAbrir(
    (opts) => interaction.editReply(opts),
    (opts) => channel.send(opts),
    interaction.guildId,
    interaction.user,
    cajaNombre
  );
}

export async function run(message: Message, args: string[]): Promise<void> {
  if (!message.guildId || !message.guild) {
    await message.reply("Este comando solo se usa en servidores.");
    return;
  }

  if (message.client) startAutoSync(message.client);

  const mainArg = (args[0] || "").toLowerCase();
  const sub = (mainArg === "abrir" || mainArg === "info") ? mainArg : "abrir";
  const offset = (mainArg === "abrir" || mainArg === "info") ? 1 : 0;
  
  const cajaNombreRestante = args.slice(offset).join(" ").trim();
  const cajaNombre = cajaNombreRestante.length > 0 ? cajaNombreRestante : "Mr lucky Común";

  if (sub === "info") {
    await handleInfo((opts) => message.reply(opts), cajaNombre);
    return;
  }

  const channel: any = message.channel;

  await handleAbrir(
    (opts) => message.reply(opts),
    (opts) => channel.send(opts),
    message.guildId,
    message.author,
    cajaNombre
  );
}