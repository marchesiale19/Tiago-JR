import { Client, EmbedBuilder, TextChannel, Guild } from "discord.js";
import { logger } from "../lib/logger";

const MONITORED_CHANNEL_ID = "1546683145628295341";
const VIGILANCE_CHANNEL_ID = "1543655897325109298";
const HELPER_ROLE_ID = "1528974868329009162";
const TRIAL_HELPER_ROLE_ID = "1509760269071679498";

const SLOWMODE_DURATION = 10; 
const TIME_WINDOW_MS = 5 * 1000; 
const MESSAGE_LIMIT = 15;
const REVERSION_DELAY_MS = 3 * 60 * 1000; 

const messageTimestamps: number[] = [];
let isSlowmodeActive = false;
let reversionTimeout: NodeJS.Timeout | null = null;

export class TrafficMonitorService {
  static handleMessage(message: any) {
    if (message.author.bot || message.channel.id !== MONITORED_CHANNEL_ID) return;

    const now = Date.now();
    messageTimestamps.push(now);

    while (messageTimestamps.length > 0 && now - messageTimestamps[0] > TIME_WINDOW_MS) {
      messageTimestamps.shift();
    }

    if (messageTimestamps.length >= MESSAGE_LIMIT && !isSlowmodeActive) {
      this.triggerAutoSlowmode(message.guild, message.channel as TextChannel);
    }
  }

  private static async triggerAutoSlowmode(guild: Guild | null, channel: TextChannel) {
    if (!guild) return;
    isSlowmodeActive = true;

    try {
      await channel.setRateLimitPerUser(SLOWMODE_DURATION, "Auto-Slowmode: Pico de tráfico anormal detectado");

      const vigilanceChannel = guild.channels.cache.get(VIGILANCE_CHANNEL_ID) as TextChannel;
      if (vigilanceChannel && vigilanceChannel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor("Red")
          .setTitle("⚡ Auto-Slowmode Activado")
          .setDescription(`Se detectó un pico anormal de tráfico en <#${MONITORED_CHANNEL_ID}> (**${MESSAGE_LIMIT} mensajes en menos de 5 segundos**).`)
          .addFields(
            { name: "Medida aplicada", value: `Slowmode de **${SLOWMODE_DURATION} segundos** activado automáticamente.`, inline: false },
            { name: "Estado", value: "Monitoreando el tráfico. Si se normaliza en los próximos 3 minutos, se retirará el slowmode solo.", inline: false }
          )
          .setTimestamp();

        const content = `<@&${HELPER_ROLE_ID}> <@&${TRIAL_HELPER_ROLE_ID}>`;
        await vigilanceChannel.send({ content, embeds: [embed] });
      }

      if (reversionTimeout) clearTimeout(reversionTimeout);
      reversionTimeout = setTimeout(async () => {
        await this.revertSlowmode(guild, channel);
      }, REVERSION_DELAY_MS);

    } catch (err) {
      logger.error({ err }, "Error al activar el auto-slowmode");
      isSlowmodeActive = false;
    }
  }

  private static async revertSlowmode(guild: Guild, channel: TextChannel) {
    try {
      await channel.setRateLimitPerUser(0, "Auto-Slowmode: Tráfico normalizado tras 3 minutos");
      isSlowmodeActive = false;
      messageTimestamps.length = 0; 

      const vigilanceChannel = guild.channels.cache.get(VIGILANCE_CHANNEL_ID) as TextChannel;
      if (vigilanceChannel && vigilanceChannel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor("Green")
          .setTitle("✅ Auto-Slowmode Retirado")
          .setDescription(`El tráfico en <#${MONITORED_CHANNEL_ID}> se ha normalizado durante los últimos 3 minutos. El slowmode fue retirado automáticamente.`)
          .setTimestamp();

        await vigilanceChannel.send({ embeds: [embed] });
      }
    } catch (err) {
      logger.error({ err }, "Error al revertir el auto-slowmode automáticamente");
      isSlowmodeActive = false;
    }
  }
}