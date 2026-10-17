
import {
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  type GuildMember,
} from "discord.js";

import { lobbyRepository } from "../database/repositories/LobbyRepository";
import { matchRepository } from "../database/repositories/MatchRepository";
import { LobbyStatus } from "../database/enums";
import { transitionTo } from "./LobbyService";
import { startMatch } from "./MatchService";
import { eventBus } from "./EventBus";
import { logger } from "../lib/logger";

// Roles autorizados para aceptar solicitudes de supervisión.
export const SUPERVISOR_ROLE_IDS = [
  "1485101671875874997", // Administrador Elite
  "1522434536796061816", // Desarrollador
  "1509760475653472287", // Administrador [PB]
] as const;

/**
 * Envía una solicitud de supervisión al chat del VC competitivo.
 */
export async function sendSupervisionRequest(
  lobbyId: string,
  guildId: string,
  vcId: string,
  vcName: string,
  client: Client,
): Promise<void> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const voiceChannel = guild.channels.cache.get(vcId);

  if (!voiceChannel || !voiceChannel.isVoiceBased()) {
    logger.warn(
      { vcId },
      "Ranked VC not found or not voice-based — supervision request not sent",
    );
    return;
  }

  const roleMentions = SUPERVISOR_ROLE_IDS
    .map((id) => `<@&${id}>`)
    .join(" ");

  const participantCount =
    await lobbyRepository.countParticipants(lobbyId);

  const embed = new EmbedBuilder()
    .setColor("Green")
    .setTitle("🎮 Se necesita un supervisor")
    .setDescription(
      `${roleMentions}\n\n` +
      `Una partida de **${participantCount} jugadores** está lista en este canal <#${vcId}>.\n\n` +
      "El primer supervisor en aceptar se unirá como supervisor y tendrá acceso a los comandos de partida.",
    )
    .addFields(
      {
        name: "Lobby ID",
        value: `\`${lobbyId.slice(0, 8)}\``,
        inline: true,
      },
      {
        name: "Canal",
        value: `<#${vcId}>`,
        inline: true,
      },
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`supervision_accept_${lobbyId}`)
      .setLabel("✅ Aceptar Supervisión")
      .setStyle(ButtonStyle.Success),
  );

  try {
    await voiceChannel.send({
      embeds: [embed],
      components: [row],
    });

    logger.info(
      { lobbyId, vcId, vcName },
      "Supervision request posted in Ranked VC chat",
    );
  } catch (err) {
    logger.error(
      { err, vcId },
      "Failed to send supervision request in voice channel chat",
    );
  }
}

/**
 * Gestiona la aceptación de una solicitud de supervisión.
 */
export async function handleSupervisionAccept(
  supervisorId: string,
  lobbyId: string,
  member: GuildMember,
  client: Client,
): Promise<void> {
  if (!hasSupervisionRole(member)) {
    throw new Error("No tienes el rango suficiente.");
  }

  const lobby = await lobbyRepository.findById(lobbyId);

  if (!lobby) {
    throw new Error("Lobby no encontrado.");
  }

  if (lobby.status !== LobbyStatus.WaitingSupervisor) {
    throw new Error(
      "Este lobby ya tiene un supervisor asignado o no está disponible.",
    );
  }

const claimed = await lobbyRepository.claimSupervisor(
  lobbyId,
  supervisorId,
  new Date(),
);

if (!claimed) {
  throw new Error(
    "Otro supervisor ya aceptó esta solicitud, o la lobby ya no está esperando supervisión.",
  );
}
  
  if (!lobby.voiceChannelId) {
    throw new Error("El lobby no tiene un canal de voz asignado.");
  }

  const guild = await client.guilds.fetch(member.guild.id);

  // Autorizar al supervisor sin reemplazar los permisos existentes.
  await grantRankedVCAccess(member, lobby.voiceChannelId);

  // Registrar al supervisor y actualizar el estado.
  await lobbyRepository.updateSupervisor(
    lobbyId,
    supervisorId,
    new Date(),
  );

  await transitionTo(lobbyId, LobbyStatus.Ready);

  // Moverlo solo si ya está conectado a un canal de voz.
  if (member.voice.channelId) {
    try {
      await member.voice.setChannel(
        lobby.voiceChannelId,
        "Supervisor joining ranked match",
      );
    } catch (err) {
      logger.warn(
        { err, supervisorId, lobbyId },
        "Failed to move supervisor to Ranked VC",
      );
    }
  }

  await startMatch(lobbyId, supervisorId, client);

  eventBus.emit("supervisor:accepted", {
    lobbyId,
    supervisorId,
  });

  logger.info(
    { lobbyId, supervisorId, guildId: guild.id },
    "Supervision accepted — match started",
  );
}

/**
 * Solicita un supervisor de reemplazo cuando el anterior queda inactivo.
 */
export async function sendReplacementSupervisionRequest(
  matchId: string,
  lobbyId: string,
  guildId: string,
  client: Client,
): Promise<void> {
  const lobby = await lobbyRepository.findById(lobbyId);

  if (!lobby) {
    throw new Error("Lobby no encontrado.");
  }

  const vcId = lobby.voiceChannelId ?? "";

  if (!vcId) {
    throw new Error("El lobby no tiene un canal de voz asignado.");
  }

  const guild = await client.guilds.fetch(guildId).catch(() => null);

  if (!guild) {
    throw new Error("Servidor no encontrado.");
  }

  const voiceChannel = guild.channels.cache.get(vcId);

  if (!voiceChannel || !voiceChannel.isVoiceBased()) {
    throw new Error("Canal de voz no encontrado.");
  }

  const roleMentions = SUPERVISOR_ROLE_IDS
    .map((id) => `<@&${id}>`)
    .join(" ");

  const embed = new EmbedBuilder()
    .setColor("Yellow")
    .setTitle("⚠️ Supervisor inactivo — Se necesita reemplazo")
    .setDescription(
      `${roleMentions}\n\n` +
      `El supervisor de la partida \`${matchId.slice(0, 8)}\` está inactivo en <#${vcId}>.\n\n` +
      "El primer supervisor en aceptar tomará el control de la partida.",
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`supervision_replace_${lobbyId}`)
      .setLabel("✅ Aceptar Supervisión")
      .setStyle(ButtonStyle.Success),
  );

  await voiceChannel.send({
    embeds: [embed],
    components: [row],
  });

  logger.info(
    { lobbyId, matchId },
    "Replacement supervision request posted in Ranked VC chat",
  );
}

/**
 * Gestiona la aceptación de un supervisor de reemplazo.
 */
export async function handleSupervisionReplace(
  supervisorId: string,
  lobbyId: string,
  member: GuildMember,
  client: Client,
): Promise<void> {
  if (!hasSupervisionRole(member)) {
    throw new Error(
      "No tienes ninguno de los roles de supervisor requeridos.",
    );
  }

  const lobby = await lobbyRepository.findById(lobbyId);

  if (!lobby) {
    throw new Error("Lobby no encontrado.");
  }

  if (lobby.status !== LobbyStatus.InGame) {
    throw new Error(
      "Esta partida no está en curso o ya tiene un supervisor activo.",
    );
  }

  if (!lobby.voiceChannelId) {
    throw new Error("El lobby no tiene un canal de voz asignado.");
  }

  // Dar acceso al nuevo supervisor sin borrar los permisos existentes.
  await grantRankedVCAccess(member, lobby.voiceChannelId);

  await lobbyRepository.updateSupervisor(
    lobbyId,
    supervisorId,
    new Date(),
  );

  const partida = await matchRepository.findByLobbyId(lobbyId);

  if (partida) {
    await matchRepository.updateMatchDetails(partida.id, {
      supervisorId,
    });
  }

  if (member.voice.channelId) {
    try {
      await member.voice.setChannel(
        lobby.voiceChannelId,
        "Replacement supervisor joining ranked match",
      );
    } catch (err) {
      logger.warn(
        { err, supervisorId, lobbyId },
        "Failed to move replacement supervisor to Ranked VC",
      );
    }
  }

  eventBus.emit("supervisor:replaced", {
    lobbyId,
    supervisorId,
  });

  logger.info(
    { lobbyId, supervisorId },
    "Supervisor replaced in-game",
  );

  void client;
}

/**
 * Concede acceso individual al VC competitivo.
 * No reemplaza los permisos de los jugadores ni los roles autorizados.
 */
async function grantRankedVCAccess(
  member: GuildMember,
  vcId: string,
): Promise<void> {
  const channel = await member.guild.channels.fetch(vcId);

  if (!channel || channel.type !== 2) {
    throw new Error("Canal de voz competitivo no encontrado.");
  }

  await channel.permissionOverwrites.edit(
    member.id,
    {
      [PermissionFlagsBits.ViewChannel]: true,
      [PermissionFlagsBits.Connect]: true,
      [PermissionFlagsBits.SendMessages]: true,
      [PermissionFlagsBits.ReadMessageHistory]: true,
    },
    {
      reason: "Autorizar supervisor en VC competitivo",
    },
  );

  logger.info(
    {
      supervisorId: member.id,
      vcId,
    },
    "Supervisor granted access to Ranked VC",
  );
}

// ── Helpers ───────────────────────────────────────────────────

export function hasSupervisionRole(member: GuildMember): boolean {
  return member.roles.cache.some((role) =>
    (SUPERVISOR_ROLE_IDS as readonly string[]).includes(role.id),
  );
}
