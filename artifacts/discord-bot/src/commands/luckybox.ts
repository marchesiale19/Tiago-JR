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
export const ROL_SEGURO_ID = "1461499864457412865";
export const ROL_QUEBRADO_ID = "1478210697199353976";
export const ROL_ESCLAVO_SADY_ID = "1478210995066372337";
export const ROL_ESCLAVO_RAYII_ID = "1478210926883639456";

export const COMMON_LUCKYBOX_REWARDS = [
  { texto: "45,000 Frijoles", valor: 45000, tipo: "positivo", probabilidad: "25.0%" },
  { texto: "60,000 Frijoles", valor: 60000, tipo: "positivo", probabilidad: "20.0%" },
  { texto: "65,000 Frijoles", valor: 65000, tipo: "positivo", probabilidad: "15.0%" },
  { texto: "80,000 Frijoles", valor: 80000, tipo: "positivo", probabilidad: "8.0%" },
  { texto: "100,000 Frijoles", valor: 100000, tipo: "positivo", probabilidad: "3.0%" },
  { texto: "-20,000 Frijoles", valor: -20000, tipo: "negativo", probabilidad: "20.0%" },
  { texto: "-25,000 Frijoles", valor: -25000, tipo: "negativo", probabilidad: "9.0%" },
] as const;

export const RARE_LUCKYBOX_REWARDS = [
  { texto: "400,000 Frijoles", valor: 400000, tipo: "positivo", probabilidad: "25.0%" },
  { texto: "1,000,000 Frijoles", valor: 1000000, tipo: "positivo", probabilidad: "5.0%" },
  { texto: "Rol \"Seguro\"", valor: 0, tipo: "rol_seguro", probabilidad: "10.0%" },
  { texto: "Rol \"Quebrado\"", valor: 0, tipo: "rol_quebrado", probabilidad: "10.0%" },
  { texto: "-100,000 Frijoles", valor: -100000, tipo: "negativo", probabilidad: "30.0%" },
  { texto: "-50,000 Frijoles", valor: -50000, tipo: "negativo", probabilidad: "20.0%" },
] as const;

export const EPIC_LUCKYBOX_REWARDS = [
  { texto: "850,000 Frijoles", valor: 850000, tipo: "positivo", probabilidad: "20.0%" },
  { texto: "950,000 Frijoles", valor: 950000, tipo: "positivo", probabilidad: "15.0%" },
  { texto: "1,200,000 Frijoles", valor: 1200000, tipo: "positivo", probabilidad: "10.0%" },
  { texto: "1,500,000 Frijoles", valor: 1500000, tipo: "positivo", probabilidad: "5.0%" },
  { texto: "1,750,000 Frijoles", valor: 1750000, tipo: "positivo", probabilidad: "2.0%" },
  { texto: "Rol \"esclavo de sady\"", valor: 0, tipo: "rol_esclavo_sady", probabilidad: "4.0%" },
  { texto: "Rol \"esclavo de rayii\"", valor: 0, tipo: "rol_esclavo_rayii", probabilidad: "4.0%" },
  { texto: "-500,000 Frijoles", valor: -500000, tipo: "negativo", probabilidad: "25.0%" },
  { texto: "-625,000 Frijoles", valor: -625000, tipo: "negativo", probabilidad: "15.0%" },
] as const;

export function pickReward(cajaNombre: string) {
  const rand = Math.random() * 100;
  let acumulado = 0;
  const nombreLower = cajaNombre.toLowerCase();

  if (nombreLower.includes("épico") || nombreLower.includes("epico")) {
    const probabilidadesEpico = [20.0, 15.0, 10.0, 5.0, 2.0, 4.0, 4.0, 25.0, 15.0];
    for (let i = 0; i < EPIC_LUCKYBOX_REWARDS.length; i++) {
      acumulado += probabilidadesEpico[i];
      if (rand <= acumulado) {
        return EPIC_LUCKYBOX_REWARDS[i];
      }
    }
    return EPIC_LUCKYBOX_REWARDS[0];
  } else if (nombreLower.includes("raro")) {
    const probabilidadesRaro = [25.0, 5.0, 10.0, 10.0, 30.0, 20.0];
    for (let i = 0; i < RARE_LUCKYBOX_REWARDS.length; i++) {
      acumulado += probabilidadesRaro[i];
      if (rand <= acumulado) {
        return RARE_LUCKYBOX_REWARDS[i];
      }
    }
    return RARE_LUCKYBOX_REWARDS[0];
  } else {
    const probabilidadesComun = [25.0, 20.0, 15.0, 8.0, 3.0, 20.0, 9.0];
    for (let i = 0; i < COMMON_LUCKYBOX_REWARDS.length; i++) {
      acumulado += probabilidadesComun[i];
      if (rand <= acumulado) {
        return COMMON_LUCKYBOX_REWARDS[i];
      }
    }
    return COMMON_LUCKYBOX_REWARDS[0];
  }
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
          .addChoices(
            { name: "Mr lucky Común", value: "Mr lucky Común" },
            { name: "Mr lucky Raro", value: "Mr lucky Raro" },
            { name: "Mr lucky Épico", value: "Mr lucky Épico" },
          ),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("info")
      .setDescription("Muestra la información y recompensas posibles de los Mr lucky.")
      .addStringOption((option) =>
        option
          .setName("caja")
          .setDescription("Tipo de caja para ver información")
          .setRequired(true)
          .addChoices(
            { name: "Mr lucky Común", value: "Mr lucky Común" },
            { name: "Mr lucky Raro", value: "Mr lucky Raro" },
            { name: "Mr lucky Épico", value: "Mr lucky Épico" },
          ),
      ),
  );

function getRewardsArray(cajaNombre: string) {
  const lower = cajaNombre.toLowerCase();
  if (lower.includes("épico") || lower.includes("epico")) return EPIC_LUCKYBOX_REWARDS;
  if (lower.includes("raro")) return RARE_LUCKYBOX_REWARDS;
  return COMMON_LUCKYBOX_REWARDS;
}

async function handleInfo(sendReply: (options: any) => Promise<any>, cajaNombre: string) {
  const rewards = getRewardsArray(cajaNombre);

  const positivos = rewards.filter((r) => r.tipo === "positivo" || r.tipo.startsWith("rol"))
    .map((r) => `• **${r.texto}** — \`${r.probabilidad}\``)
    .join("\n");

  const negativos = rewards.filter((r) => r.tipo === "negativo")
    .map((r) => `• **${r.texto}** — \`${r.probabilidad}\``)
    .join("\n");

  const infoEmbed = new EmbedBuilder()
    .setColor("Orange")
    .setTitle(`📊 Información de Recompensas: ${cajaNombre}`)
    .setDescription(`Listado de premios y castigos posibles al abrir un **${cajaNombre}**, con sus respectivas probabilidades de obtención:`)
    .addFields(
      { name: "✨ Recompensas", value: positivos || "Ninguno", inline: false },
      { name: "⚠️ Castigos", value: negativos || "Ninguno", inline: false },
    )
    .setFooter({ text: "Sistema de Luckybox • Informaciones Oficiales" })
    .setTimestamp();

  await sendReply({ embeds: [infoEmbed] });
}

async function handleAbrir(
  sendReply: (options: any) => Promise<any>,
  sendChannelMessage: (options: any) => Promise<any>,
  guild: Guild,
  targetUser: any,
  cajaNombre: string
) {
  try {
    const guildId = guild.id;
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

    const rewardObj = pickReward(cajaNombre);
    let rewardDescription: string = rewardObj.texto; 
    const member = await guild.members.fetch(targetUser.id).catch(() => null);

    if (rewardObj.tipo === "rol_seguro" && member) {
      const role = await guild.roles.fetch(ROL_SEGURO_ID).catch(() => null);
      if (role) {
        await member.roles.add(role, "Premio de caja").catch(() => {});
        rewardDescription = `Rol <@&${ROL_SEGURO_ID}>`;
      }
    } else if (rewardObj.tipo === "rol_quebrado" && member) {
      const role = await guild.roles.fetch(ROL_QUEBRADO_ID).catch(() => null);
      if (role) {
        await member.roles.add(role, "Premio de caja").catch(() => {});
        rewardDescription = `Rol <@&${ROL_QUEBRADO_ID}>`;
      }
    } else if (rewardObj.tipo === "rol_esclavo_sady" && member) {
      const role = await guild.roles.fetch(ROL_ESCLAVO_SADY_ID).catch(() => null);
      if (role) {
        await member.roles.add(role, "Premio de Mr lucky Épico").catch(() => {});
        rewardDescription = `Rol <@&${ROL_ESCLAVO_SADY_ID}>`;
      }
    } else if (rewardObj.tipo === "rol_esclavo_rayii" && member) {
      const role = await guild.roles.fetch(ROL_ESCLAVO_RAYII_ID).catch(() => null);
      if (role) {
        await member.roles.add(role, "Premio de Mr lucky Épico").catch(() => {});
        rewardDescription = `Rol <@&${ROL_ESCLAVO_RAYII_ID}>`;
      }
    } else if (rewardObj.valor !== 0) {
      await unb.editUserBalance(guildId, targetUser.id, { cash: rewardObj.valor });
    }

    const embed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle(`🎁 ${cajaNombre} Abierto`)
      .setDescription(`¡<@${targetUser.id}> abrió su **${cajaNombre}**!`)
      .addFields(
        { name: "📦 Tipo de Item", value: `\`${cajaNombre}\``, inline: true },
        { name: "🎉 Premio/castigo obtenido", value: ` ${rewardDescription}`, inline: false },
        { name: "💸 Estado", value: `El item fue validado del inventario y el resultado fue aplicado a tu cuenta.`, inline: false },
      )
      .setFooter({ text: "Sistema de Luckybox • Inventario Verificado" })
      .setTimestamp();

    await sendReply({ content: `✅ ¡Luckybox abierto con éxito!` });
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
    interaction.guild,
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
    message.guild,
    message.author,
    cajaNombre
  );
}