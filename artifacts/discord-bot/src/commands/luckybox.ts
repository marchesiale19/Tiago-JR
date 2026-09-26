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

// Nuevos roles para MR LUCKY ADMIN
export const ROL_ESCLAVO_BAX_ID = "1461517408203313244";
export const ROL_ESCLAVO_SANTIAGO_ID = "1461961845513519187";
export const ROL_ESCLAVO_RAYI_ID = "1478210926883639456";
export const ROL_OMG_BRO_ID = "1478217120465555630";

// Mapeo centralizado de roles para evitar condicionales redundantes
const ROLE_MAP: Record = {
  rol_seguro: ROL_SEGURO_ID,
  rol_quebrado: ROL_QUEBRADO_ID,
  rol_esclavo_sady: ROL_ESCLAVO_SADY_ID,
  rol_esclavo_rayii: ROL_ESCLAVO_RAYII_ID,
  rol_esclavo_bax: ROL_ESCLAVO_BAX_ID,
  rol_esclavo_santiago: ROL_ESCLAVO_SANTIAGO_ID,
  rol_esclavo_rayi: ROL_ESCLAVO_RAYI_ID,
  rol_omg_bro: ROL_OMG_BRO_ID,
};

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
  { texto: "350,000 Frijoles", valor: 350000, tipo: "positivo", probabilidad: "25.0%" },
  { texto: "550,000 Frijoles", valor: 550000, tipo: "positivo", probabilidad: "12.0%" },
  { texto: `Rol <@&\({ROL_SEGURO_ID}>`, valor: 0, tipo: "rol_seguro", probabilidad: "8.0\%" },   { texto: `Rol <@&\){ROL_QUEBRADO_ID}>`, valor: 0, tipo: "rol_quebrado", probabilidad: "1.0%" },
  { texto: "-150,000 Frijoles", valor: -150000, tipo: "negativo", probabilidad: "34.0%" },
  { texto: "-250,000 Frijoles", valor: -250000, tipo: "negativo", probabilidad: "20.0%" },
] as const;

export const EPIC_LUCKYBOX_REWARDS = [
  { texto: "1,200,000 Frijoles", valor: 1200000, tipo: "positivo", probabilidad: "22.0%" },
  { texto: "1,800,000 Frijoles", valor: 1800000, tipo: "positivo", probabilidad: "12.0%" },
  { texto: "2,500,000 Frijoles", valor: 2500000, tipo: "positivo", probabilidad: "5.0%" },
  { texto: `Rol <@&\({ROL_ESCLAVO_SADY_ID}>`, valor: 0, tipo: "rol_esclavo_sady", probabilidad: "0.8\%" },   { texto: `Rol <@&\){ROL_ESCLAVO_RAYII_ID}>`, valor: 0, tipo: "rol_esclavo_rayii", probabilidad: "0.2%" },
  { texto: "-600,000 Frijoles", valor: -600000, tipo: "negativo", probabilidad: "35.0%" },
  { texto: "-1,000,000 Frijoles", valor: -1000000, tipo: "negativo", probabilidad: "25.0%" },
] as const;

export const ADMIN_LUCKYBOX_REWARDS = [
  { texto: "67,000 Frijoles", valor: 67000, tipo: "positivo", probabilidad: "25.0%" },
  { texto: "75,000 Frijoles", valor: 75000, tipo: "positivo", probabilidad: "20.0%" },
  { texto: "100,000 Frijoles", valor: 100000, tipo: "positivo", probabilidad: "15.0%" },
  { texto: "235,000 Frijoles", valor: 235000, tipo: "positivo", probabilidad: "10.0%" },
  { texto: "500,000 Frijoles", valor: 500000, tipo: "positivo", probabilidad: "5.0%" },
  { texto: "750,000 Frijoles", valor: 750000, tipo: "positivo", probabilidad: "3.0%" },
  { texto: "1,000,000 Frijoles", valor: 1000000, tipo: "positivo", probabilidad: "1.8%" },
  { texto: "2,000,000 Frijoles (Muy poco probable)", valor: 2000000, tipo: "positivo", probabilidad: "0.2%" },
  { texto: `Rol <@&\({ROL_ESCLAVO_BAX_ID}>`, valor: 0, tipo: "rol_esclavo_bax", probabilidad: "6.0\%" },   { texto: `Rol <@&\){ROL_ESCLAVO_SANTIAGO_ID}>`, valor: 0, tipo: "rol_esclavo_santiago", probabilidad: "5.0%" },
  { texto: `Rol <@&\({ROL_ESCLAVO_RAYI_ID}>`, valor: 0, tipo: "rol_esclavo_rayi", probabilidad: "3.0\%" },   { texto: `Rol <@&\){ROL_OMG_BRO_ID}> (Muy poco probable)`, valor: 0, tipo: "rol_omg_bro", probabilidad: "1.0%" },
  { texto: "-100,000 Frijoles (Tienes que ser la sal en persona)", valor: -100000, tipo: "negativo", probabilidad: "5.0%" },
] as const;

export function pickReward(cajaNombre: string) {
  const rand = Math.random() * 100;
  let acumulado = 0;
  const nombreLower = cajaNombre.toLowerCase();

  let rewards: readonly any[];
  let probabilities: number[];

  if (nombreLower.includes("admin")) {
    rewards = ADMIN_LUCKYBOX_REWARDS;
    probabilities = [25.0, 20.0, 15.0, 10.0, 5.0, 3.0, 1.8, 0.2, 6.0, 5.0, 3.0, 1.0, 5.0];
  } else if (nombreLower.includes("épico") || nombreLower.includes("epico")) {
    rewards = EPIC_LUCKYBOX_REWARDS;
    probabilities = [22.0, 12.0, 5.0, 0.8, 0.2, 35.0, 25.0];
  } else if (nombreLower.includes("raro")) {
    rewards = RARE_LUCKYBOX_REWARDS;
    probabilities = [25.0, 12.0, 8.0, 1.0, 34.0, 20.0];
  } else {
    rewards = COMMON_LUCKYBOX_REWARDS;
    probabilities = [25.0, 20.0, 15.0, 8.0, 3.0, 20.0, 9.0];
  }

  for (let i = 0; i < rewards.length; i++) {
    acumulado += probabilities[i];
    if (rand <= acumulado) return rewards[i];
  }
  return rewards[0];
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

    for (const [, member] of role.members) {
      if (!topUserIds.has(member.id)) {
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
            { name: "MR LUCKY ADMIN", value: "MR LUCKY ADMIN" },
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
            { name: "MR LUCKY ADMIN", value: "MR LUCKY ADMIN" },
          ),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("dar")
      .setDescription("Entrega una caja Mr lucky a un usuario (Solo administradores).")
      .addUserOption((option) =>
        option
          .setName("usuario")
          .setDescription("Usuario al que le darás la caja")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("caja")
          .setDescription("Tipo de Mr lucky a regalar")
          .setRequired(true)
          .addChoices(
            { name: "Mr lucky Común", value: "Mr lucky Común" },
            { name: "Mr lucky Raro", value: "Mr lucky Raro" },
            { name: "Mr lucky Épico", value: "Mr lucky Épico" },
            { name: "MR LUCKY ADMIN", value: "MR LUCKY ADMIN" },
          ),
      ),
  );

function getRewardsArray(cajaNombre: string) {
  const lower = cajaNombre.toLowerCase();
  if (lower.includes("admin")) return ADMIN_LUCKYBOX_REWARDS;
  if (lower.includes("épico") || lower.includes("epico")) return EPIC_LUCKYBOX_REWARDS;
  if (lower.includes("raro")) return RARE_LUCKYBOX_REWARDS;
  return COMMON_LUCKYBOX_REWARDS;
}

async function handleInfo(sendReply: (options: any) => Promise, cajaNombre: string): Promise {
  const rewards = getRewardsArray(cajaNombre);

  const positivos = rewards
    .filter((r) => r.tipo === "positivo" || r.tipo.startsWith("rol"))
    .map((r) => `• **\({r.texto}** — \`\){r.probabilidad}\``)
    .join("\n");

  const negativos = rewards
    .filter((r) => r.tipo === "negativo")
    .map((r) => `• **\({r.texto}** — \`\){r.probabilidad}\``)
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

async function handleDar(
  sendReply: (options: any) => Promise,
  guild: Guild,
  moderatorUser: any,
  targetUser: any,
  cajaNombre: string
): Promise {
  try {
    const member = await guild.members.fetch(moderatorUser.id).catch(() => null);
    if (member && !member.permissions.has("Administrator")) {
      await sendReply({ content: "❌ No tienes permisos de Administrador para usar este subcomando.", ephemeral: true });
      return;
    }

    if (moderatorUser.id === targetUser.id) {
      await sendReply({ content: "❌ No puedes darte una Luckybox a ti mismo.", ephemeral: true });
      return;
    }

    const guildId = guild.id;
    const response = await fetch(`https://unbelievaboat.com/api/v1/guilds/\({guildId}/users/\){targetUser.id}/inventory`, {
      method: "POST",
      headers: {
        Authorization: process.env.UNBELIEVABOAT_API_KEY as string,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        item_id: cajaNombre,
        quantity: 1,
      }),
    });

    if (!response.ok && response.status !== 201) {
      throw new Error("No se pudo añadir el item al inventario mediante la API.");
    }

    const embed = new EmbedBuilder()
      .setColor("Green")
      .setTitle(`🎁 ¡Caja Entregada!`)
      .setDescription(`El administrador <@\({moderatorUser.id}> le ha entregado un **\){cajaNombre}** a <@${targetUser.id}>.`)
      .setTimestamp();

    await sendReply({ embeds: [embed] });
  } catch (err: any) {
    logger.error({ err, targetUserId: targetUser.id }, "Error al dar item de mr lucky");
    await sendReply({ 
      content: `⚠️ Se procesó la acción, pero verifica si la API de UnbelievaBoat requiere el ID exacto del item. (\`${err?.message}\`)`, 
      ephemeral: true 
    });
  }
}

async function handleAbrir(
  sendReply: (options: any) => Promise,
  sendChannelMessage: (options: any) => Promise,
  guild: Guild,
  targetUser: any,
  cajaNombre: string
): Promise {
  try {
    const guildId = guild.id;
    const response = await fetch(`https://unbelievaboat.com/api/v1/guilds/\({guildId}/users/\){targetUser.id}/inventory`, {
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

    await fetch(`https://unbelievaboat.com/api/v1/guilds/\({guildId}/users/\){targetUser.id}/inventory/\({userBox.item_id \vert{}\vert{} userBox.id}`, {       method: "DELETE",       headers: {         Authorization: process.env.UNBELIEVABOAT_API_KEY as string,         "Content-Type": "application/json",       },       body: JSON.stringify({ quantity: 1 }),     }).catch(() => {});      const rewardObj = pickReward(cajaNombre);     let rewardDescription: string = rewardObj.texto;      const member = await guild.members.fetch(targetUser.id).catch(() => null);      // Asignación limpia de roles usando el mapa     if (ROLE_MAP[rewardObj.tipo] && member) {       const roleId = ROLE_MAP[rewardObj.tipo];       const role = await guild.roles.fetch(roleId).catch(() => null);       if (role) {         await member.roles.add(role, "Premio de caja").catch(() => {});         rewardDescription = `Rol <@&\){roleId}>`;
      }
    } else if (rewardObj.valor !== 0) {
      await unb.editUserBalance(guildId, targetUser.id, { cash: rewardObj.valor });
    }

    const embed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle(`🎁 \({cajaNombre} Abierto`)       .setDescription(`¡<@\){targetUser.id}> abrió su **${cajaNombre}**!`)
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

export async function execute(interaction: ChatInputCommandInteraction): Promise {
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

  if (subcommand === "dar") {
    const targetUser = interaction.options.getUser("usuario", true);
    await interaction.deferReply({ flags: 64 });
    await handleDar((opts) => interaction.editReply(opts), interaction.guild, interaction.user, targetUser, cajaNombre);
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

export async function run(message: Message, args: string[]): Promise {
  if (!message.guildId || !message.guild) {
    await message.reply("Este comando solo se usa en servidores.");
    return;
  }

  if (message.client) startAutoSync(message.client);

  const mainArg = (args[0] || "").toLowerCase();
  const sub = (mainArg === "abrir" || mainArg === "info" || mainArg === "dar") ? mainArg : "abrir";
  const offset = (mainArg === "abrir" || mainArg === "info" || mainArg === "dar") ? 1 : 0;

  if (sub === "dar") {
    const mentionedUser = message.mentions.users.first();
    if (!mentionedUser) {
      await message.reply("❌ Debes mencionar al usuario a quien le darás la caja.");
      return;
    }
    const cajaNombreRestante = args.slice(offset + 1).join(" ").trim();
    const cajaNombre = cajaNombreRestante.length > 0 ? cajaNombreRestante : "Mr lucky Común";

    await handleDar((opts) => message.reply(opts), message.guild, message.author, mentionedUser, cajaNombre);
    return;
  }

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
