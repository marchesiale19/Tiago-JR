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

// Recompensas para la Lucky Box Común
export const COMMON_LUCKYBOX_REWARDS = [
  { texto: "45,000 Frijoles", valor: 45000 },
  { texto: "60,000 Frijoles", valor: 60000 },
  { texto: "65,000 Frijoles", valor: 65000 },
  { texto: "80,000 Frijoles", valor: 80000 },
  { texto: "100,000 Frijoles", valor: 100000 },
  { texto: "-20,000 Frijoles", valor: -20000 },
  { texto: "-25,000 Frijoles", valor: -25000 },
] as const;

// Recompensas para la Lucky Box Arcano
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
  if (cajaTipo === "Lucky Box Arcano") {
    const index = Math.floor(Math.random() * ARCANO_LUCKYBOX_REWARDS.length);
    return ARCANO_LUCKYBOX_REWARDS[index] ?? ARCANO_LUCKYBOX_REWARDS[0];
  }
  const index = Math.floor(Math.random() * COMMON_LUCKYBOX_REWARDS.length);
  return COMMON_LUCKYBOX_REWARDS[index] ?? COMMON_LUCKYBOX_REWARDS[0];
}

export const data = new SlashCommandBuilder()
  .setName("luckybox")
  .setDescription("Abre una Lucky Box si el usuario la tiene en su inventario.")
  .addUserOption((option) =>
    option
      .setName("usuario")
      .setDescription("El usuario que abrió la caja")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("caja")
      .setDescription("Tipo de caja a abrir")
      .setRequired(true)
      .addChoices(
        { name: "Lucky Box Común", value: "Lucky Box Común" },
        { name: "Lucky Box Arcano", value: "Lucky Box Arcano" }
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

  const targetUser = interaction.options.getUser("usuario", true);
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

    // 2. Buscar si el usuario tiene la caja seleccionada y su cantidad es mayor a 0
    const userBox = items.find(
      (item: any) => 
        (item.name?.toLowerCase() === cajaNombre.toLowerCase() || item.item_name?.toLowerCase() === cajaNombre.toLowerCase() || item.item_id?.toLowerCase() === cajaNombre.toLowerCase()) && 
        ((item.quantity ?? item.quantiy ?? 0) > 0)
    );

    if (!userBox) {
      await interaction.editReply({
        content: `❌ El usuario <@${targetUser.id}> **no tiene** ninguna **${cajaNombre}** en su inventario.`,
      });
      return;
    }

    // 3. Descontar 1 caja del inventario mediante la API REST
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

    // 4. Elegir recompensa al azar según el tipo de caja y acreditarla
    const rewardObj = pickReward(cajaNombre);
    await unb.editUserBalance(guildId, targetUser.id, { cash: rewardObj.valor });

    // 5. Crear el embed informativo
    const embed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle(`🎁 ${cajaNombre} Abierta`)
      .setDescription(`¡<@${targetUser.id}> abrió su caja!`)
      .addFields(
        {
          name: "📦 Tipo de Caja",
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
          value: `La caja fue validada del inventario y los **${rewardObj.texto}** fueron aplicados a su cuenta.`,
          inline: false,
        },
      )
      .setFooter({ text: "Sistema de Lucky Boxes • Inventario Verificado" })
      .setTimestamp();

    // 6. Responder con éxito y enviar el embed al canal
    await interaction.editReply({
      content: `✅ ¡Caja abierta con éxito!`,
    });

    const channel = interaction.channel as TextChannel | null;
    if (channel) {
      await channel.send({ embeds: [embed] });
    }
  } catch (err: any) {
    logger.error({ err, targetUserId: targetUser.id }, "Error validating inventory for luckybox");
    await interaction.editReply({
      content: `❌ **Error al verificar el inventario:** \`${err?.message || "Error desconocido"}\``,
    });
  }
}