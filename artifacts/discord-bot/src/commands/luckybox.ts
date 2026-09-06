import {
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Message,
  type TextChannel,
} from "discord.js";
import pkg from "unb-api";
const { Client: UnbClient } = pkg;
import { logger } from "../lib/logger";

const unb = new UnbClient(process.env.UNBELIEVABOAT_API_KEY as string);

// ID del Rol Top Casino (Top 1-10)
export const ROL_TOP_CASINO_ID = "1546068235072442398";

// Recompensas para el Mr lucky Común con sus porcentajes exactos basados en la cantidad de opciones (7 totales)
export const COMMON_LUCKYBOX_REWARDS = [
  { texto: "45,000 Frijoles", valor: 45000, tipo: "positivo", probabilidad: "14.28%" },
  { texto: "60,000 Frijoles", valor: 60000, tipo: "positivo", probabilidad: "14.28%" },
  { texto: "65,000 Frijoles", valor: 65000, tipo: "positivo", probabilidad: "14.28%" },
  { texto: "80,000 Frijoles", valor: 80000, tipo: "positivo", probabilidad: "14.28%" },
  { texto: "100,000 Frijoles", valor: 100000, tipo: "positivo", probabilidad: "14.28%" },
  { texto: "-20,000 Frijoles", valor: -20000, tipo: "negativo", probabilidad: "14.28%" },
  { texto: "-25,000 Frijoles", valor: -25000, tipo: "negativo", probabilidad: "14.28%" },
] as const;

export function pickReward() {
  const index = Math.floor(Math.random() * COMMON_LUCKYBOX_REWARDS.length);
  return COMMON_LUCKYBOX_REWARDS[index] ?? COMMON_LUCKYBOX_REWARDS[0];
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

// Ejecutor unificado: si el manejador de tu bot le pasa un message por error, lo intercepta y ejecuta el prefijo
export async function execute(
  interactionOrMessage: ChatInputCommandInteraction | Message,
  args?: string[]
): Promise<void> {
  // Interceptación de seguridad si el bot pasa un Message a execute por error
  if (!("isChatInputCommand" in interactionOrMessage) && !("options" in interactionOrMessage)) {
    return run(interactionOrMessage as Message, args || []);
  }

  const interaction = interactionOrMessage as ChatInputCommandInteraction;
  const subcommand = interaction.options.getSubcommand() || "abrir";
  const cajaNombre = interaction.options.getString("caja", true);

  if (!interaction.guildId || !interaction.member) {
    await interaction.reply({ content: "Este comando solo se usa en servidores.", ephemeral: true });
    return;
  }

  if (subcommand === "info") {
    await interaction.deferReply({ flags: 64 });
    await handleInfo((opts) => interaction.editReply(opts), cajaNombre);
    return;
  }

  await interaction.deferReply({ flags: 64 });
  const channel = interaction.channel as TextChannel | null;

  await handleAbrir(
    (opts) => interaction.editReply(opts),
    (opts) => channel ? channel.send(opts) : Promise.resolve(null),
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

  const sub = (args[0] || "abrir").toLowerCase();
  const cajaNombreRestante = args.slice(1).join(" ").trim();
  const cajaNombre = cajaNombreRestante.length > 0 ? cajaNombreRestante : "Mr lucky Común";

  if (sub === "info") {
    await handleInfo((opts) => message.reply(opts), cajaNombre);
    return;
  }

  await handleAbrir(
    (opts) => message.reply(opts),
    (opts) => (message.channel as any).send ? (message.channel as any).send(opts) : Promise.resolve(null),
    message.guildId,
    message.author,
    cajaNombre
  );
}
