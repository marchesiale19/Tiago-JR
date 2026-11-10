import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../lib/logger";
import { activeLuckyboxDrops, getLuckyboxItemId } from "../commands/luckybox";

const GENERAL_CHANNEL_ID = "1546683145628295341";
const TARGET_GUILD_ID = "1437644356977823884";
const DROP_INTERVAL_MS = 60 * 60 * 1000; // 1 hora

let isAutoDropStarted = false;

export function startLuckyboxAutoDropService(client: Client): void {
  if (isAutoDropStarted) return;
  isAutoDropStarted = true;

  logger.info("✅ LuckyboxAutoDropService inicializado correctamente.");

  setInterval(async () => {
    try {
      const guild = client.guilds.cache.get(TARGET_GUILD_ID);
      if (!guild) {
        logger.warn({ guildId: TARGET_GUILD_ID }, "Auto-drop: No se encontró el servidor principal.");
        return;
      }

      const channel = await guild.channels.fetch(GENERAL_CHANNEL_ID).catch(() => null);
      if (!channel || !channel.isTextBased() || !("send" in channel)) {
        logger.warn({ channelId: GENERAL_CHANNEL_ID }, "Auto-drop: No se encontró el canal general de texto.");
        return;
      }

      const cajaNombre = "Mr Lucky Común";
      const itemId = getLuckyboxItemId(cajaNombre);
      if (!itemId) {
        logger.error({ cajaNombre }, "Auto-drop: No se encontró el ID de item para Mr Lucky Común.");
        return;
      }

      const dropId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle("🎁 ¡Luckybox automática en el chat general!")
        .setDescription(
          `¡Se ha soltado una **${cajaNombre}** automática!\n\n` +
          `El primero que tenga el **rol de Casino** y presione **Reclamar** se queda con la caja.`
        )
        .addFields({
          name: "📦 Caja",
          value: `**${cajaNombre}**`,
          inline: true,
        })
        .setFooter({
          text: "Sistema de Luckybox • Drop automático por hora",
        })
        .setTimestamp();

      // Utiliza el prefijo exacto para que el botón active handleLuckyboxDropButton y valide el rol de casino
      const button = new ButtonBuilder()
        .setCustomId(`luckybox_drop_claim:${dropId}`)
        .setLabel("Reclamar")
        .setEmoji("🎁")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

      const dropMessage = await channel.send({
        embeds: [embed],
        components: [row],
      });

      activeLuckyboxDrops.set(dropId, {
        dropId,
        guildId: guild.id,
        channelId: dropMessage.channelId,
        messageId: dropMessage.id,
        cajaNombre,
        itemId,
        claimed: false,
      });

      logger.info(
        {
          guildId: guild.id,
          channelId: channel.id,
          dropId,
          messageId: dropMessage.id,
        },
        "Luckybox automática común dropeada correctamente en chat general."
      );
    } catch (err) {
      logger.error({ err }, "Error en el servicio de auto-drop de Luckybox.");
    }
  }, DROP_INTERVAL_MS);
}
