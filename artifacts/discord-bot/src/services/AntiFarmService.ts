
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type VoiceState,
  type User,
  type Guild,
  type Message,
} from "discord.js";
import { logger } from "../lib/logger";

// ======================================================
// CONFIGURACIÓN
// ======================================================

// Servidor donde funcionará el sistema
const TARGET_GUILD_ID = "1437644356977823884";

// Canal AFK de destino
const AFK_CHANNEL_ID = "1478566817579667600";

// Canales de voz de Among Us vigilados
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

// Tiempo solo antes de recibir la pregunta: 15 minutos
const SOLITARY_TIMEOUT_MS = 15 * 60 * 1000;

// Tiempo para responder: 2 minutos
const RESPONSE_TIMEOUT_MS = 2 * 60 * 1000;

// Prefijo de los botones
export const ANTI_FARM_BUTTON_PREFIX = "antifarm_response";

// ======================================================
// INTERFACES Y SESIONES
// ======================================================

interface ActiveAntiFarmSession {
  userId: string;
  guildId: string;
  channelId: string;
  solitaryTimer: NodeJS.Timeout;
  responseTimer?: NodeJS.Timeout;
  messageId?: string;
}

const activeSessions = new Map<string, ActiveAntiFarmSession>();

// ======================================================
// LIMPIEZA DE SESIONES
// ======================================================

function clearUserSession(userId: string): void {
  const session = activeSessions.get(userId);

  if (!session) return;

  clearTimeout(session.solitaryTimer);

  if (session.responseTimer) {
    clearTimeout(session.responseTimer);
  }

  activeSessions.delete(userId);
}

// ======================================================
// MOVER USUARIO AL CANAL AFK
// ======================================================

async function moveToAfk(
  guild: Guild,
  userId: string,
  expectedChannelId?: string
): Promise<boolean> {
  try {
    // Seguridad: solamente permitir este servidor
    if (guild.id !== TARGET_GUILD_ID) {
      return false;
    }

    const member = await guild.members.fetch(userId).catch(() => null);

    if (!member || !member.voice.channel) {
      return false;
    }

    // Evitamos moverlo si ya cambió de canal
    if (
      expectedChannelId &&
      member.voice.channelId !== expectedChannelId
    ) {
      logger.info(
        { userId, guildId: guild.id },
        "[AntiFarm] El usuario ya no está en el canal original. Se cancela el movimiento."
      );

      return false;
    }

    const afkChannel = await guild.channels
      .fetch(AFK_CHANNEL_ID)
      .catch(() => null);

    if (!afkChannel || !afkChannel.isVoiceBased()) {
      logger.warn(
        { guildId: guild.id, afkChannelId: AFK_CHANNEL_ID },
        "[AntiFarm] El canal AFK no existe o no es un canal de voz."
      );

      return false;
    }

    await member.voice.setChannel(
      AFK_CHANNEL_ID,
      "Anti-farmeo: Inactividad prolongada en solitario."
    );

    logger.info(
      { userId, guildId: guild.id },
      "[AntiFarm] Usuario movido al canal AFK."
    );

    return true;

  } catch (err) {
    logger.error(
      { err, userId, guildId: guild.id },
      "[AntiFarm] No se pudo mover al usuario al canal AFK."
    );

    return false;
  }
}

// ======================================================
// INICIAR UNA SESIÓN DE VIGILANCIA
// ======================================================

function startSolitarySession(
  userId: string,
  guildId: string,
  channelId: string,
  client: any
): void {
  clearUserSession(userId);

  const solitaryTimer = setTimeout(() => {
    void triggerAfkCheck(client, userId, guildId, channelId);
  }, SOLITARY_TIMEOUT_MS);

  activeSessions.set(userId, {
    userId,
    guildId,
    channelId,
    solitaryTimer,
  });

  logger.info(
    { userId, guildId, channelId },
    "[AntiFarm] Iniciado el temporizador de soledad."
  );
}

// ======================================================
// PREGUNTAR SI EL USUARIO SIGUE ACTIVO
// ======================================================

async function triggerAfkCheck(
  client: any,
  userId: string,
  guildId: string,
  channelId: string
): Promise<void> {
  const session = activeSessions.get(userId);

  if (!session) return;

  if (guildId !== TARGET_GUILD_ID) {
    clearUserSession(userId);
    return;
  }

  try {
    const user: User = await client.users.fetch(userId);
    const guild: Guild = await client.guilds.fetch(guildId);

    // Comprobar que siga en el mismo canal y esté solo
    const channel = await guild.channels
      .fetch(channelId)
      .catch(() => null);

    if (
      !channel ||
      !channel.isVoiceBased() ||
      channel.members.size !== 1 ||
      !channel.members.has(userId)
    ) {
      clearUserSession(userId);
      return;
    }

    // Crear el mensaje de advertencia
    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle("🤖 ¿Seguís ahí?")
      .setDescription(
        "¡Buenas! Detectamos que llevás un buen rato **solo** en un canal de voz de Among Us.\n\n" +
        "¿Seguís ahí o te fuiste?\n\n" +
        "Confirmame si estás activo presionando alguno de los botones de abajo.\n\n" +
        "⏳ Tenés **2 minutos** para responder. Si no contestás, te vamos a mover automáticamente al canal AFK."
      )
      .setFooter({
        text: "Sistema automático anti-farmeo",
      })
      .setTimestamp();

    // Botones de respuesta
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ANTI_FARM_BUTTON_PREFIX}:yes:${userId}`)
        .setLabel("Sí, sigo acá")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`${ANTI_FARM_BUTTON_PREFIX}:no:${userId}`)
        .setLabel("No, ya me fui")
        .setStyle(ButtonStyle.Danger)
    );

    let alertMessage: Message | null = null;

    // --------------------------------------------------
    // PRIMER INTENTO: MENSAJE PRIVADO
    // --------------------------------------------------

    alertMessage = await user.send({
      embeds: [embed],
      components: [row],
    }).catch(() => null);

    // --------------------------------------------------
    // SEGUNDO INTENTO: CHAT DEL CANAL DE VOZ
    // --------------------------------------------------

    if (!alertMessage) {
      logger.warn(
        { userId, guildId, channelId },
        "[AntiFarm] No se pudo enviar MD. Intentando avisar en el chat de voz."
      );

      const voiceChannel = await guild.channels
        .fetch(channelId)
        .catch(() => null);

      if (
        voiceChannel &&
        voiceChannel.isVoiceBased() &&
        voiceChannel.members.size === 1 &&
        voiceChannel.members.has(userId)
      ) {
        // Comprobar si el canal permite enviar mensajes
        const sendMessage = (voiceChannel as any).send;

        if (typeof sendMessage === "function") {
          alertMessage = await sendMessage.call(voiceChannel, {
            content: `<@${userId}>`,
            embeds: [embed],
            components: [row],
            allowedMentions: {
              users: [userId],
            },
          }).catch(() => null);
        }
      }
    }

    // --------------------------------------------------
    // SI FALLAN AMBOS MÉTODOS
    // --------------------------------------------------

    if (!alertMessage) {
      logger.warn(
        { userId, guildId, channelId },
        "[AntiFarm] No se pudo enviar el aviso por MD ni por el chat de voz."
      );

      await moveToAfk(guild, userId, channelId);

      clearUserSession(userId);
      return;
    }

    session.messageId = alertMessage.id;

    logger.info(
      { userId, guildId, channelId, messageId: alertMessage.id },
      "[AntiFarm] Aviso de actividad enviado correctamente."
    );

    // --------------------------------------------------
    // TEMPORIZADOR DE RESPUESTA: 2 MINUTOS
    // --------------------------------------------------

    session.responseTimer = setTimeout(async () => {
      const currentSession = activeSessions.get(userId);

      // Evitar que un temporizador antiguo afecte otra sesión
      if (currentSession !== session) return;

      await moveToAfk(guild, userId, channelId);

      clearUserSession(userId);

      // Avisar que el tiempo terminó
      await alertMessage!.edit({
        content: "❌ **Se terminó el tiempo.** No recibimos tu respuesta y te movimos al canal AFK. ¡Cuando vuelvas, podés entrar de nuevo!",
        embeds: [],
        components: [],
      }).catch(() => {});

    }, RESPONSE_TIMEOUT_MS);

  } catch (err) {
    logger.error(
      { err, userId, guildId },
      "[AntiFarm] Error al comprobar la actividad del usuario."
    );

    clearUserSession(userId);
  }
}

// ======================================================
// MANEJADOR DE CAMBIOS EN CANALES DE VOZ
// ======================================================

export function handleAntiFarmVoiceUpdate(
  oldState: VoiceState,
  newState: VoiceState
): void {
  const userId = newState.id;
  const guild = newState.guild;

  // Solamente trabajar en el servidor configurado
  if (guild.id !== TARGET_GUILD_ID) return;

  const newChannelId = newState.channelId;
  const oldChannelId = oldState.channelId;

  // Si el usuario cambió de canal o se desconectó,
  // cancelar su sesión anterior
  if (oldChannelId !== newChannelId) {
    clearUserSession(userId);
  }

  // --------------------------------------------------
  // EL USUARIO ENTRA A UN CANAL VIGILADO
  // --------------------------------------------------

  if (
    newChannelId &&
    AMONG_US_VC_IDS.has(newChannelId)
  ) {
    const channel = newState.channel;

    if (channel && channel.members.size === 1) {
      startSolitarySession(
        userId,
        guild.id,
        newChannelId,
        guild.client
      );
    }
  }

  // --------------------------------------------------
  // ALGUIEN SALE DE UN CANAL VIGILADO
  // --------------------------------------------------

  if (
    oldChannelId &&
    oldChannelId !== newChannelId &&
    AMONG_US_VC_IDS.has(oldChannelId)
  ) {
    const oldChannel = oldState.channel;

    if (oldChannel && oldChannel.members.size === 1) {
      const remainingUser = oldChannel.members.first();

      if (remainingUser) {
        startSolitarySession(
          remainingUser.id,
          guild.id,
          oldChannel.id,
          guild.client
        );
      }
    }
  }
}

// ======================================================
// MANEJADOR DE BOTONES
// ======================================================

export async function handleAntiFarmButton(
  interaction: any
): Promise<void> {

  if (!interaction.isButton()) return;

  if (
    !interaction.customId.startsWith(
      ANTI_FARM_BUTTON_PREFIX + ":"
    )
  ) {
    return;
  }

  // Solamente aceptar interacciones del servidor configurado
  if (interaction.guildId && interaction.guildId !== TARGET_GUILD_ID) {
    return;
  }

  const parts = interaction.customId.split(":");

  const action = parts[1];
  const targetUserId = parts[2];

  // Comprobar que el botón sea del usuario correspondiente
  if (interaction.user.id !== targetUserId) {
    await interaction.reply({
      content: "❌ Che, este botón no es para vos.",
      ephemeral: true,
    }).catch(() => {});

    return;
  }

  // Comprobar que la acción sea válida
  if (action !== "yes" && action !== "no") {
    return;
  }

  const session = activeSessions.get(targetUserId);

  // Evitar respuestas a botones de sesiones antiguas
  if (!session || session.guildId !== TARGET_GUILD_ID) {
    await interaction.reply({
      content: "⌛ Esta comprobación ya venció o fue cancelada.",
      ephemeral: true,
    }).catch(() => {});

    return;
  }

  const guild = await interaction.client.guilds
    .fetch(session.guildId)
    .catch(() => null);

  if (!guild) {
    await interaction.reply({
      content: "❌ No pude encontrar el servidor. Avisale a un administrador.",
      ephemeral: true,
    }).catch(() => {});

    return;
  }

  // ==================================================
  // RESPUESTA: SÍ, SIGO ACÁ
  // ==================================================

  if (action === "yes") {
    clearUserSession(targetUserId);

    const member = await guild.members
      .fetch(targetUserId)
      .catch(() => null);

    // Reiniciar los 15 minutos solamente si sigue solo
    // en el mismo canal vigilado
    if (
      member &&
      member.voice.channelId === session.channelId &&
      AMONG_US_VC_IDS.has(session.channelId) &&
      member.voice.channel?.members.size === 1
    ) {
      startSolitarySession(
        targetUserId,
        guild.id,
        session.channelId,
        interaction.client
      );
    }

    await interaction.update({
      content: "✅ **¡De una!** Gracias por confirmar que seguís ahí. Reiniciamos el contador. ¡Que sigas disfrutando!",
      embeds: [],
      components: [],
    }).catch(() => {});

    logger.info(
      { userId: targetUserId, guildId: guild.id },
      "[AntiFarm] Usuario confirmó que sigue activo."
    );

    return;
  }

  // ==================================================
  // RESPUESTA: NO, YA ME FUI
  // ==================================================

  if (action === "no") {
    clearUserSession(targetUserId);

    const moved = await moveToAfk(
      guild,
      targetUserId,
      session.channelId
    );

    await interaction.update({
      content: moved
        ? "🔒 **¡Listo!** Nos avisaste que ya no estás activo. Te movimos al canal AFK."
        : "ℹ️ **¡Entendido!** No pudimos moverte al AFK porque ya no estás en el canal original o no estás conectado.",
      embeds: [],
      components: [],
    }).catch(() => {});

    logger.info(
      { userId: targetUserId, guildId: guild.id, moved },
      "[AntiFarm] Usuario respondió que no está activo."
    );
  }
}
