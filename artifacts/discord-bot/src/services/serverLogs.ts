import {
  EmbedBuilder,
  AuditLogEvent,
  type Client,
  type GuildTextBasedChannel,
  type Message,
  type PartialMessage,
  type VoiceState,
  type GuildMember,
} from "discord.js";

import { logger } from "../lib/logger";

/* ========================================================================== */
/*                          CONFIGURACIÓN DE IDs                              */
/* ========================================================================== */

const SERVER_ORIGIN_ID = "1437644356977823884"; // Servidor A (Origen)
const SERVER_TARGET_ID = "1545116281651462325"; // Servidor B (Destino)

const LOG_CHANNELS = {
  vc: "1558202077530947648",
  mensajesEditados: "1558203185955471380",
  mensajesBorrados: "1558203226342301836",
  cambiosPerfil: "1558203293488906371",
  roles: "1558204158434222142",
  canales: "1558204179934220449",
  mutes: "1558202990631063684",
  kicks: "1558202976148136117",
  baneos: "1558202915141713970",
};

const EMBED_COLOR = 0xffa500; // Naranja obligatorio

/* ========================================================================== */
/*                        FUNCIÓN AUXILIAR DE ENVÍO                           */
/* ========================================================================== */

async function sendLog(
  client: Client,
  channelId: string,
  embed: EmbedBuilder,
): Promise<void> {
  try {
    const targetGuild = await client.guilds.fetch(SERVER_TARGET_ID).catch(() => null);
    if (!targetGuild) return;

    const channel = await targetGuild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    await (channel as GuildTextBasedChannel).send({ embeds: [embed] });
  } catch (err) {
    logger.error({ err, channelId }, "Error al enviar el log al servidor de destino.");
  }
}

/* ========================================================================== */
/*                     REGISTRO DE LISTENERS DE EVENTOS                       */
/* ========================================================================== */

export function setupServerLogs(client: Client): void {
  
  // 1. LOGS DE VOZ (vc)
  client.on("voiceStateUpdate", async (oldState: VoiceState, newState: VoiceState) => {
    if (newState.guild.id !== SERVER_ORIGIN_ID) return;

    const member = newState.member;
    if (!member) return;

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    // Entró a un canal de voz
    if (!oldChannel && newChannel) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("🔊 Usuario Conectado a Voz")
        .setDescription(`<@${member.id}> se unió a un canal de voz.`)
        .addFields(
          { name: "👤 Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: "📁 Canal", value: `${newChannel.name} (\`${newChannel.id}\`)`, inline: true },
          { name: "⏰ Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        )
        .setTimestamp();

      await sendLog(client, LOG_CHANNELS.vc, embed);
    }
    // Salió de un canal de voz
    else if (oldChannel && !newChannel) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("🔇 Usuario Desconectado de Voz")
        .setDescription(`<@${member.id}> salió del canal de voz.`)
        .addFields(
          { name: "👤 Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: "📁 Canal Anterior", value: `${oldChannel.name} (\`${oldChannel.id}\`)`, inline: true },
          { name: "⏰ Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        )
        .setTimestamp();

      await sendLog(client, LOG_CHANNELS.vc, embed);
    }
    // Cambió de canal de voz
    else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("🔀 Cambio de Canal de Voz")
        .setDescription(`<@${member.id}> cambió de canal de voz.`)
        .addFields(
          { name: "👤 Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: "📁 De", value: `${oldChannel.name}`, inline: true },
          { name: "📁 A", value: `${newChannel.name}`, inline: true },
          { name: "⏰ Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        )
        .setTimestamp();

      await sendLog(client, LOG_CHANNELS.vc, embed);
    }
  });

  // 2. LOGS DE MENSAJES EDITADOS
  client.on("messageUpdate", async (oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) => {
    if (newMessage.guild?.id !== SERVER_ORIGIN_ID) return;
    if (oldMessage.content === newMessage.content) return;
    if (newMessage.author?.bot) return;

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle("✏️ Mensaje Editado")
      .addFields(
        { name: "👤 Autor", value: `${newMessage.author?.tag ?? "Desconocido"} (\`${newMessage.author?.id ?? "N/A"}\`)`, inline: false },
        { name: "📁 Canal", value: `<#${newMessage.channelId}>`, inline: false },
        { name: "📄 Mensaje Anterior", value: oldMessage.content || "*[Sin contenido previo o multimedia]*", inline: false },
        { name: "📄 Mensaje Nuevo", value: newMessage.content || "*[Sin contenido nuevo o multimedia]*", inline: false },
        { name: "⏰ Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      )
      .setTimestamp();

    await sendLog(client, LOG_CHANNELS.mensajesEditados, embed);
  });

  // 3. LOGS DE MENSAJES BORRADOS
  client.on("messageDelete", async (message: Message | PartialMessage) => {
    if (message.guild?.id !== SERVER_ORIGIN_ID) return;
    if (message.author?.bot) return;

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle("🗑️ Mensaje Borrado")
      .addFields(
        { name: "👤 Autor", value: `${message.author?.tag ?? "Desconocido"} (\`${message.author?.id ?? "N/A"}\`)`, inline: true },
        { name: "📁 Canal", value: `<#${message.channelId}>`, inline: true },
        { name: "📄 Contenido", value: message.content || "*[Mensaje sin texto o multimedia]*", inline: false },
        { name: "⏰ Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      )
      .setTimestamp();

    await sendLog(client, LOG_CHANNELS.mensajesBorrados, embed);
  });

  // 4. LOGS DE CAMBIOS DE PERFIL (Apodos / Nicknames)
  client.on("guildMemberUpdate", async (oldMember: GuildMember | any, newMember: GuildMember) => {
    if (newMember.guild.id !== SERVER_ORIGIN_ID) return;

    if (oldMember.nickname !== newMember.nickname) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("👤 Cambio de Apodo (Nickname)")
        .addFields(
          { name: "👤 Usuario", value: `${newMember.user.tag} (\`${newMember.id}\`)`, inline: false },
          { name: "❌ Apodo Anterior", value: oldMember.nickname || "*[Ninguno]*", inline: true },
          { name: "✔️ Apodo Nuevo", value: newMember.nickname || "*[Ninguno]*", inline: true },
          { name: "⏰ Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        )
        .setTimestamp();

      await sendLog(client, LOG_CHANNELS.cambiosPerfil, embed);
    }
  });

  // 5. LOGS DE ROLES
  client.on("roleCreate", async (role) => {
    if (role.guild.id !== SERVER_ORIGIN_ID) return;

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle("✨ Rol Creado")
      .addFields(
        { name: "📌 Rol", value: `${role.name} (\`${role.id}\`)`, inline: true },
        { name: "🎨 Color", value: `\`#${role.color.toString(16)}\``, inline: true },
        { name: "⏰ Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      )
      .setTimestamp();

    await sendLog(client, LOG_CHANNELS.roles, embed);
  });

  client.on("roleDelete", async (role) => {
    if (role.guild.id !== SERVER_ORIGIN_ID) return;

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle("🗑️ Rol Eliminado")
      .addFields(
        { name: "📌 Rol", value: `${role.name} (\`${role.id}\`)`, inline: true },
        { name: "⏰ Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      )
      .setTimestamp();

    await sendLog(client, LOG_CHANNELS.roles, embed);
  });

  // 6. LOGS DE CANALES
  client.on("channelCreate", async (channel) => {
    if (!("guild" in channel) || channel.guild.id !== SERVER_ORIGIN_ID) return;

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle("📁 Canal Creado")
      .addFields(
        { name: "📌 Nombre", value: `${channel.name} (\`${channel.id}\`)`, inline: true },
        { name: "📂 Tipo", value: `\`${channel.type}\``, inline: true },
        { name: "⏰ Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      )
      .setTimestamp();

    await sendLog(client, LOG_CHANNELS.canales, embed);
  });

  client.on("channelDelete", async (channel) => {
    if (!("guild" in channel) || channel.guild.id !== SERVER_ORIGIN_ID) return;

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle("🗑️ Canal Eliminado")
      .addFields(
        { name: "📌 Nombre", value: `${channel.name} (\`${channel.id}\`)`, inline: true },
        { name: "⏰ Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      )
      .setTimestamp();

    await sendLog(client, LOG_CHANNELS.canales, embed);
  });

  // 7, 8 y 9. LOGS DE AUDITORÍA (Baneos, Kicks, Mutes)
  client.on("guildAuditLogEntryCreate", async (auditEntry, guild) => {
    if (guild.id !== SERVER_ORIGIN_ID) return;

    const { action, executor, target, reason } = auditEntry;

    if (action === AuditLogEvent.MemberBanAdd) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("🔨 Usuario Baneado")
        .addFields(
          { name: "👤 Usuario Afectado", value: `${target?.tag ?? "Desconocido"} (\`${target?.id ?? "N/A"}\`)`, inline: false },
          { name: "🛡️ Responsable", value: `${executor?.tag ?? "Desconocido"} (\`${executor?.id ?? "N/A"}\`)`, inline: false },
          { name: "📝 Razón", value: reason || "Sin razón especificada", inline: false },
          { name: "⏰ Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        )
        .setTimestamp();

      await sendLog(client, LOG_CHANNELS.baneos, embed);
    }

    if (action === AuditLogEvent.MemberKick) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("👢 Usuario Expulsado (Kick)")
        .addFields(
          { name: "👤 Usuario Afectado", value: `${target?.tag ?? "Desconocido"} (\`${target?.id ?? "N/A"}\`)`, inline: false },
          { name: "🛡️ Responsable", value: `${executor?.tag ?? "Desconocido"} (\`${executor?.id ?? "N/A"}\`)`, inline: false },
          { name: "📝 Razón", value: reason || "Sin razón especificada", inline: false },
          { name: "⏰ Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        )
        .setTimestamp();

      await sendLog(client, LOG_CHANNELS.kicks, embed);
    }

    if (action === AuditLogEvent.MemberUpdate) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("🔇 Usuario Silenciado (Timeout)")
        .addFields(
          { name: "👤 Usuario Afectado", value: `${target?.tag ?? "Desconocido"} (\`${target?.id ?? "N/A"}\`)`, inline: false },
          { name: "🛡️ Responsable", value: `${executor?.tag ?? "Desconocido"} (\`${executor?.id ?? "N/A"}\`)`, inline: false },
          { name: "📝 Razón", value: reason || "Sin razón especificada", inline: false },
          { name: "⏰ Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        )
        .setTimestamp();

      await sendLog(client, LOG_CHANNELS.mutes, embed);
    }
  });

  logger.info("Sistema de Server Logs (Cross-Server) inicializado correctamente.");
}
