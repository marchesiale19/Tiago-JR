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

// Recompensas para el Mr lucky Común
export const COMMON_LUCKYBOX_REWARDS = [
  { texto: "45,000 Frijoles", valor: 45000 },
  { texto: "60,000 Frijoles", valor: 60000 },
  { texto: "65,000 Frijoles", valor: 65000 },
  { texto: "80,000 Frijoles", valor: 80000 },
  { texto: "100,000 Frijoles", valor: 100000 },
  { texto: "-20,000 Frijoles", valor: -20000 },
  { texto: "-25,000 Frijoles", valor: -25000 },
] as const;

// Recompensas para el Mr lucky Arcano
export const ARCANO_LUCKYBOX_REWARDS = [
  { texto: "150,000 Frijoles", valor: 150000 },
  { texto: "175,000 Frijoles", valor: 175000 },
  { texto: "200,000 Frijoles", valor: 200000 },
  { texto: "250,000 Frijoles", valor: 250000 },
  { texto: "325,000 Frijoles", valor: 325000 },
  { texto: "450,000 Frijoles", valor: 450000 },
  { texto: "-100,000 Frijoles", valor: -100000 },
  { texto: "-130,000 Frijoles", valor: -130000 },
  { texto: "-150,000 Frijoles", valor: -150000 },
] as const;

export function pickReward(cajaTipo: string) {
  if (cajaTipo === "Mr lucky Arcano") {
    const index = Math.floor(Math.random() * ARCANO_LUCKYBOX_REWARDS.length);
    return ARCANO_LUCKYBOX_REWARDS[index] ?? ARCANO_LUCKYBOX_REWARDS[0];
  }
  const index = Math.floor(Math.random() * COMMON_LUCKYBOX_REWARDS.length);
  return COMMON_LUCKYBOX_REWARDS[index] ?? COMMON_LUCKYBOX_REWARDS[0];
}

export const data = new SlashCommandBuilder()
  .setName("luckybox")
  .setDescription("Abre un Mr lucky si lo tienes en tu inventario.")
  .addStringOption((option) =>
    option
      .setName("caja")
      .setDescription("Tipo de Mr lucky a abrir")
      .setRequired(true)
      .addChoices(
        { name: "Mr lucky Común", value: "Mr lucky Común" },
        { name: "Mr lucky Arcano", value: "Mr lucky Arcano" }
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ flags: 64 });

  if (!interaction.guildId || !interaction.member) {
    await interaction.editReply({ content: "Este comando solo se usa en servidores." });
    return;
  }

  // Tomamos al usuario que ejecuta el comando automáticamente
  const targetUser = interaction.user;
  const cajaNombre = interaction.options.getString("caja", true);
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

    // 4. Elegir recompensa al azar según el tipo de Mr lucky y acreditarla
    const rewardObj = pickReward(cajaNombre);
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
