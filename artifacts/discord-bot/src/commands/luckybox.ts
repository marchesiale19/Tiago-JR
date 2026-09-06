import {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
  type Message,
} from "discord.js";
import pkg from "unb-api";
const { Client: UnbClient } = pkg;
import { logger } from "../lib/logger";

const unb = new UnbClient(process.env.UNBELIEVABOAT_API_KEY as string);

// ID del Rol Top Casino (Top 1-10)
export const ROL_TOP_CASINO_ID = "1546068235072442398";

// IDs de los roles autorizados para la sincronización manual
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

// Función para verificar permisos o roles específicos
function tienePermisoSync(member: any): boolean {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  return ROLES_AUTORIZADOS.some((roleId) => member.roles?.cache?.has(roleId));
}

// Recompensas para el Mr lucky Común con distribución equilibrada y atractiva (Suma exacta: 100%)
export const COMMON_LUCKYBOX_REWARDS = [
  { texto: "45,000 Frijoles", valor: 45000, tipo: "positivo", probabilidad: "25.0%" },
  { texto: "60,000 Frijoles", valor: 60000, tipo: "positivo", probabilidad: "20.0%" },
  { texto: "65,000 Frijoles", valor: 65000, tipo: "positivo", probabilidad: "15.0%" },
  { texto: "80,000 Frijoles", valor: 80000, tipo: "positivo", probabilidad: "8.0%" },
  { texto: "100,000 Frijoles", valor: 100000, tipo: "positivo", probabilidad: "3.0%" },
  { texto: "-20,000 Frijoles", valor: -20000, tipo: "negativo", probabilidad: "20.0%" },
  { texto: "-25,000 Frijoles", valor: -25000, tipo: "negativo", probabilidad: "9.0%" },
] as const;

// Sistema de selección ponderada basado en porcentajes reales
export function pickReward() {
  const rand = Math.random() * 100;
  let acumulado = 0;

  // Asignamos rangos basados en los porcentajes
  const probabilidadesNumericas = [25.0, 20.0, 15.0, 8.0, 3.0, 20.0, 9.0];

  for (let i = 0; i < COMMON_LUCKYBOX_REWARDS.length; i++) {
    acumulado += probabilidadesNumericas[i];
    if (rand <= acumulado) {
      return COMMON_LUCKYBOX_REWARDS[i];
    }
  }
  return COMMON_LUCKYBOX_REWARDS[0];
}

// Sincronización automática del Top 10 de UnbelievaBoat con los roles de Discord
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

    // Quitar rol a quienes ya no están en el Top 10
    for (const [memberId, member] of role.members) {
      if (!topUserIds.has(memberId)) {
        await member.roles.remove(role, "Ya no forma parte del Top 10 del Casino.");
        removedCount++;
      }
    }

    // Agregar rol a los nuevos del Top 10
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

// Intervalo automático de respaldo en segundo plano cada 1 hora
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
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("sync")
      .setDescription("Sincroniza manualmente el Top 10 del Casino y sus roles (Staff Autorizado).")
  );

// Función centralizada para manejar la lógica de "info"
async function handleInfo(sendReply: (options: any) => Promise<any>, cajaNombre: string) {
  const positivos = COMMON_LUCKYBOX_REWARDS.filter((r) => r.tipo === "positivo")
    .map((r) => `• **${r.texto}** — \`${r.probabilidad}\``)
    .join("\n");

  const negativos = COMMON_LUCKYBOX_REWARDS.filter((r) => r.tipo === "negativo")
    .map((r) => `• **${r.texto}** — \`${r.probabilidad}\``)
    .join("\n");

  const infoEmbed = new EmbedBuilder()
    .setColor("Blue")
    .setTitle(`📊 Información de Recompensas: ${cajaNombre}`)
    .setDescription(`Listado de premios y castigos posibles al abrir un **${cajaNombre}**, con sus respectivas probabilidades de obtención:`)
    .addFields(
      {
        name: "✨ Recompensas Positivas",
        value: positivos,
        inline: false,
      },
      {
        name: "⚠️ Recompensas Negativas (Castigos)",
        value: negativos,
        inline: false,
      },
    )
    .setFooter({ text: "Sistema de Mr Lucky • Probabilidades Oficiales" })
    .setTimestamp();

  await sendReply({ embeds: [infoEmbed] });
}

// Función centralizada para manejar la lógica de "abrir"
async function handleAbrir(
  sendReply: (options: any) => Promise<any>,
  sendChannelMessage: (options: any) => Promise<any>,
  guildId: string,
  targetUser: any,
  cajaNombre: string
) {
  try {
    // 1. Consultar el inventario usando la ruta REST oficial de UnbelievaBoat
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

    // 2. Buscar si el usuario tiene el item usando coincidencias parciales flexibles (.includes)
    const userBox = items.find((item: any) => {
      const itemName = (item.name || item.item_name || item.item_id || "").toLowerCase();
      const targetQuery = cajaNombre.toLowerCase();
      const hasQuantity = (item.quantity ?? item.quantiy ?? item.count ?? 1) > 0;

      return itemName.includes(targetQuery) && hasQuantity;
    });

    if (!userBox) {
      await sendReply({
        content: `❌ No tienes ningún **${cajaNombre}** en tu inventario.`,
      });
      return;
    }

    // 3. Descontar 1 unidad del inventario mediante la API REST
    await (fetch as any)(`https://unbelievaboat.com/api/v1/guilds/${guildId}/users/${targetUser.id}/inventory/${userBox.item_id || userBox.id}`, {
      method: "DELETE",
      headers: {
        Authorization: process.env.UNBELIEVABOAT_API_KEY as string,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ quantity: 1 }),
    }).catch(() => {
      // Si falla el decremento por seguridad de la API, dejamos pasar la entrega del premio
    });

    // 4. Elegir recompensa al azar y acreditarla
    const rewardObj = pickReward();
    await unb.editUserBalance(guildId, targetUser.id, { cash: rewardObj.valor });

    // 5. Crear el embed informativo
    const embed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle(`🎁 ${cajaNombre} Abierto`)
      .setDescription(`¡<@${targetUser.id}> abrió su **${cajaNombre}**!`)
      .addFields(
        {
          name: "📦 Tipo de Item",
          value: `\`${cajaNombre}\``,
          inline: true,
        },
        {
          name: "🎉 Premio obtenido",
          value: ` ${rewardObj.texto}`,
          inline: false,
        },
        {
          name: "💸 Estado",
          value: `El item fue validado del inventario y los **${rewardObj.texto}** fueron aplicados a tu cuenta.`,
          inline: false,
        },
      )
      .setFooter({ text: "Sistema de Mr Lucky • Inventario Verificado" })
      .setTimestamp();

    // 6. Responder con éxito y enviar el embed al canal
    await sendReply({
      content: `✅ ¡Mr lucky abierto con éxito!`,
    });

    await sendChannelMessage({ embeds: [embed] });
  } catch (err: any) {
    logger.error({ err, targetUserId: targetUser.id }, "Error validating inventory for mr lucky");
    await sendReply({
      content: `❌ **Error al verificar el inventario:** \`${err?.message || "Error desconocido"}\``,
    });
  }
}

// Ejecutor unificado con validación estricta de tipo de objeto
export async function execute(
  interactionOrMessage: ChatInputCommandInteraction | Message,
  args?: string[]
): Promise<void> {
  // Si tiene la propiedad 'content', es un Message enviado por prefijo (ej: "-luckybox")
  if ("content" in interactionOrMessage || !("isChatInputCommand" in interactionOrMessage)) {
    return run(interactionOrMessage as Message, args || []);
  }

  const interaction = interactionOrMessage as ChatInputCommandInteraction;
  if (interaction.client) startAutoSync(interaction.client);

  const subcommand = interaction.options.getSubcommand() || "abrir";

  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "Este comando solo se usa en servidores.", ephemeral: true });
    return;
  }

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
    return;
  }

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

// Ejecutor oficial para comandos por prefijo de texto plano
export async function run(message: Message, args: string[]): Promise<void> {
  if (!message.guildId || !message.guild) {
    await message.reply("Este comando solo se usa en servidores.");
    return;
  }

  if (message.client) startAutoSync(message.client);

  const sub = (args[0] || "abrir").toLowerCase();

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
    return;
  }

  const cajaNombreRestante = args.slice(1).join(" ").trim();
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
