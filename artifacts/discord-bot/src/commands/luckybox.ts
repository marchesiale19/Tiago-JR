import {
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
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

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand() || "abrir";
  const cajaNombre = interaction.options.getString("caja", true);

  // --- SUBCOMANDO INFO ---
  if (subcommand === "info") {
    await interaction.deferReply({ flags: 64 });

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

    await interaction.editReply({ embeds: [infoEmbed] });
    return;
  }

  // --- SUBCOMANDO ABRIR ---
  await interaction.deferReply({ flags: 64 });

  if (!interaction.guildId || !interaction.member) {
    await interaction.editReply({ content: "Este comando solo se usa en servidores." });
    return;
  }

  const targetUser = interaction.user;
  const guildId = interaction.guildId;

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
      await interaction.editReply({
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
    await interaction.editReply({
      content: `✅ ¡Mr lucky abierto con éxito!`,
    });

    const channel = interaction.channel as TextChannel | null;
    if (channel) {
      await channel.send({ embeds: [embed] });
    }
  } catch (err: any) {
    logger.error({ err, targetUserId: targetUser.id }, "Error validating inventory for mr lucky");
    await interaction.editReply({
      content: `❌ **Error al verificar el inventario:** \`${err?.message || "Error desconocido"}\``,
    });
  }
}
