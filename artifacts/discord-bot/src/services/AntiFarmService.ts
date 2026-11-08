import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type VoiceState,
  type User,
  type Guild,
} from "discord.js";
import { logger } from "../lib/logger";

// IDs de los canales de Among Us vigilados
const AMONG_US_VC_IDS = new Set([
  "1452030683588333568",
  "1478541699041984583",
  "1452030713791774882",
  "1452030742602453174",
  "1452174467441627208",
  "1462162035185029356",
  "1462517911607316480",
  "1478541393470292211",
  "1478541114695749702",
  "1553554498436333599",
  "1538256157347418183",
  "1538784135802523699",
  "1538784288051564545",
  "1538784348277309480",
]);

// Tiempo de soledad antes de preguntar (15 minutos, en ms)
const SOLITARY_TIMEOUT_MS = 15 * 60 * 1000;

// Tiempo límite para que responda el MD (2 minutos, en ms)
const RESPONSE_TIMEOUT_MS = 2 * 60 * 1000;

interface ActiveAntiFarmSession {
  userId: string;
  guildId: string;
  channelId: string;
  solitaryTimer: NodeJS.Timeout;
  responseTimer?: NodeJS.Timeout;
  messageId?: string;
}

const activeSessions = new Map<string, ActiveAntiFarmSession>();

export const ANTI_FARM_BUTTON_PREFIX = "antifarm_response";

/**
 * Limpia y cancela todos los timers asociados a un usuario.
 */
function clearUserSession(userId: string): void {
  const session = activeSessions.get(userId);
  if (session) {
    if (session.solitaryTimer) clearTimeout(session.solitaryTimer);
    if (session.responseTimer) clearTimeout(session.responseTimer);
    activeSessions.delete(userId);
  }
}

/**
 * Mueve al usuario al canal AFK del servidor.
 */
async function moveToAfk(guild: Guild, userId: string): Promise<boolean> {
  try {
    const afkChannelId = guild.afkChannelId;
    if (!afkChannelId) {
      logger.warn({ guildId: guild.id }, "[AntiFarm] El servidor no tiene un canal AFK configurado.");
      return false;
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    if (member && member.voice.channel) {
      await member.voice.setChannel(afkChannelId, "Anti-farmeo: Inactividad prolongada en solitario.");
      logger.info({ userId, guildId: guild.id }, "[AntiFarm] Usuario movido al canal AFK por inactividad.");
      return true;
    }
  } catch (err) {
    logger.error({ err, userId, guildId: guild.id }, "[AntiFarm] No se pudo mover al usuario al canal AFK.");
  }
  return false;
}

/**
 * Dispara la alerta por MD al usuario que lleva mucho tiempo solo.
 */
async function triggerAfkCheck(client: any, userId: string, guildId: string, channelId: string): Promise<void> {
  const session = activeSessions.get(userId);
  if (!session) return;

  try {
    const user: User = await client.users.fetch(userId);
    const guild: Guild = await client.guilds.fetch(guildId);
    if (!user || !guild) return;

    // Verificamos si el usuario sigue en el mismo canal y sigue solo
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isVoiceBased() || channel.members.size !== 1 || !channel.members.has(userId)) {
      clearUserSession(userId);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle("🤖 ¿Estás ahí?")
      .setDescription(
        "Detectamos que llevas un rato **solo** en un canal de voz de Among Us.\n\n" +
        "Por favor, confirma si estás activo presionando **Sí** o **No**. Si no respondes en **2 minutos**, serás movido automáticamente al canal AFK."
      )
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ANTI_FARM_BUTTON_PREFIX}:yes:${userId}`)
        .setLabel("Sí, estoy aquí")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${ANTI_FARM_BUTTON_PREFIX}:no:${userId}`)
        .setLabel("No / Desconectarme")
        .setStyle(ButtonStyle.Danger)
    );

    const dmMessage = await user.send({ embeds: [embed], components: [row] }).catch(() => null);
    if (!dmMessage) {
      // Si tiene los MDs cerrados, lo movemos directamente al AFK por seguridad
      await moveToAfk(guild, userId);
      clearUserSession(userId);
      return;
    }

    session.messageId = dmMessage.id;

    // Iniciamos el temporizador de respuesta de 2 minutos
    session.responseTimer = setTimeout(async () => {
      const currentSession = activeSessions.get(userId);
      if (currentSession) {
        await moveToAfk(guild, userId);
        clearUserSession(userId);
        
        // Intentamos editar el MD para avisar que expiró
        await dmMessage.edit({
          content: "❌ *El tiempo de respuesta expiró. Has sido movido al canal AFK.*",
          components: []
        }).catch(() => {});
      }
    }, RESPONSE_TIMEOUT_MS);

  } catch (err) {
    logger.error({ err, userId }, "[AntiFarm] Error al enviar la alerta de inactividad por MD.");
    clearUserSession(userId);
  }
}

/**
 * Manejador principal que debe llamarse desde `voiceStateUpdate`.
 */
export function handleAntiFarmVoiceUpdate(oldState: VoiceState, newState: VoiceState): void {
  const userId = newState.id;
  const guild = newState.guild;
  const newChannelId = newState.channelId;
  const oldChannelId = oldState.channelId;

  // Si el usuario cambió de canal o salió
  if (oldChannelId !== newChannelId) {
    clearUserSession(userId);
  }

  // Si el usuario entra a un canal vigilado de Among Us
  if (newChannelId && AMONG_US_VC_IDS.has(newChannelId)) {
    const channel = newState.channel;
    if (!channel) return;

    // Verificamos si el canal se quedó exactamente con 1 miembro (él solo)
    if (channel.members.size === 1) {
      // Si ya tenía una sesión previa, la limpiamos por si acaso
      clearUserSession(userId);

      // Iniciamos el temporizador de soledad (12 minutos)
      const solitaryTimer = setTimeout(() => {
        triggerAfkCheck(guild.client, userId, guild.id, newChannelId);
      }, SOLITARY_TIMEOUT_MS);

      activeSessions.set(userId, {
        userId,
        guildId: guild.id,
        channelId: newChannelId,
        solitaryTimer,
      });
    }
  } else if (oldChannelId && AMONG_US_VC_IDS.has(oldChannelId)) {
    // Si alguien sale de un canal vigilado, evaluamos si el que se queda ahí se ha quedado solo
    const oldChannel = oldState.channel;
    if (oldChannel && oldChannel.members.size === 1) {
      const remainingUser = oldChannel.members.first();
      if (remainingUser && !activeSessions.has(remainingUser.id)) {
        const solitaryTimer = setTimeout(() => {
          triggerAfkCheck(guild.client, remainingUser.id, guild.id, oldChannel.id);
        }, SOLITARY_TIMEOUT_MS);

        activeSessions.set(remainingUser.id, {
          userId: remainingUser.id,
          guildId: guild.id,
          channelId: oldChannel.id,
          solitaryTimer,
        });
      }
    }
  }
}

/**
 * Manejador de las interacciones de los botones de respuesta del MD.
 */
export async function handleAntiFarmButton(interaction: any): Promise<void> {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith(ANTI_FARM_BUTTON_PREFIX)) return;

  const parts = interaction.customId.split(":");
  const action = parts[1]; // "yes" o "no"
  const targetUserId = parts[2];

  if (interaction.user.id !== targetUserId) {
    await interaction.reply({ content: "❌ Este botón no es para ti.", ephemeral: true });
    return;
  }

  const session = activeSessions.get(targetUserId);

  if (action === "yes") {
    clearUserSession(targetUserId);
    await interaction.update({
      content: "✅ ¡Entendido! Gracias por confirmar. El temporizador anti-farmeo se ha reiniciado.",
      components: []
    }).catch(() => {});
  } else if (action === "no") {
    clearUserSession(targetUserId);
    
    // Buscamos al usuario en las guilds para moverlo al AFK
    const client = interaction.client;
    for (const [, guild] of client.guilds.cache) {
      await moveToAfk(guild, targetUserId);
    }

    await interaction.update({
      content: "🔒 Has indicado que no estás activo. Has sido desconectado/movido al canal AFK.",
      components: []
    }).catch(() => {});
  }
}
