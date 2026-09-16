// eso tilin se la mastica

import {
  Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  type GuildMember,
} from "discord.js";
import { lobbyRepository }  from "../database/repositories/LobbyRepository";
import { matchRepository }  from "../database/repositories/MatchRepository";
import { LobbyStatus }      from "../database/enums";
import { transitionTo }     from "./LobbyService";
import { startMatch }       from "./MatchService";
import { eventBus }         from "./EventBus";
import { logger }           from "../lib/logger";

// roles a supervisar
export const SUPERVISOR_ROLE_IDS = [
  "1522437349869617383", // Supervisor
  "1452784726413672643", // Moderador
  "1509760381525164123", // Moderador [PB]
  "1522808445391212674", // Support
  "1528974868329009162", // Helper
  "1509760269071679498", // Trial Helper
] as const;


export async function sendSupervisionRequest(
  lobbyId:    string,
  guildId:    string,
  vcId:       string,
  vcName:     string,
  client:     Client,
): Promise<void> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const voiceChannel = guild.channels.cache.get(vcId);
  if (!voiceChannel || !voiceChannel.isVoiceBased()) {
    logger.warn({ vcId }, "Ranked VC not found or not voice-based — supervision request not sent");
    return;
  }

  const roleMentions = SUPERVISOR_ROLE_IDS.map((id) => `<@&${id}>`).join(" ");
  const participantCount = await lobbyRepository.countParticipants(lobbyId);

  const embed = new EmbedBuilder()
    .setColor("Green")
    .setTitle("🎮 Se necesita un supervisor")
    .setDescription(
      `${roleMentions}\n\n` +
      `Una partida de **${participantCount} jugadores** está lista en este canal <#${vcId}>.\n\n` +
      "El primer supervisor en aceptar se unirá como supervisor y tendrá acceso a los comandos de partida.",
    )
    .addFields(
      { name: "Lobby ID",  value: `\`${lobbyId.slice(0, 8)}\``,  inline: true },
      { name: "Canal",     value: `<#${vcId}>`,                  inline: true },
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`supervision_accept_${lobbyId}`)
      .setLabel("✅ Aceptar Supervisión")
      .setStyle(ButtonStyle.Success),
  );

  try {
    await voiceChannel.send({ embeds: [embed], components: [row] });
    logger.info({ lobbyId, vcId }, "Supervision request posted in Ranked VC chat");
  } catch (err) {
    logger.error({ err, vcId }, "Failed to send supervision request in voice channel chat");
  }
}

export async function handleSupervisionAccept(
  supervisorId: string,
  lobbyId:      string,
  member:       GuildMember,
  client:       Client,
): Promise<void> {
  if (!hasSupervisionRole(member)) {
    throw new Error("No tienes el rango suficiente.");
  }

  const lobby = await lobbyRepository.findById(lobbyId);
  if (!lobby) throw new Error("Lobby no encontrado.");
  if (lobby.status !== LobbyStatus.WaitingSupervisor) {
    throw new Error("Este lobby ya tiene un supervisor asignado o no está disponible.");
  }

  await lobbyRepository.updateSupervisor(lobbyId, supervisorId, new Date());
  await transitionTo(lobbyId, LobbyStatus.Ready);

  if (lobby.voiceChannelId) {
    try {
      await member.voice.setChannel(lobby.voiceChannelId, "Supervisor joining ranked match");
    } catch {}
  }

  await startMatch(lobbyId, supervisorId, client);

  eventBus.emit("supervisor:accepted", { lobbyId, supervisorId });
  logger.info({ lobbyId, supervisorId }, "Supervision accepted — match started");
}

export async function sendReplacementSupervisionRequest(
  matchId:    string,
  lobbyId:    string,
  guildId:    string,
  client:     Client,
): Promise<void> {
  const lobby = await lobbyRepository.findById(lobbyId);
  if (!lobby) throw new Error("Lobby no encontrado.");

  const vcId = lobby.voiceChannelId ?? "";
  if (!vcId) throw new Error("El lobby no tiene un canal de voz asignado.");

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) throw new Error("Servidor no encontrado.");

  const voiceChannel = guild.channels.cache.get(vcId);
  if (!voiceChannel || !voiceChannel.isVoiceBased()) {
    throw new Error("Canal de voz no encontrado.");
  }

  const roleMentions = SUPERVISOR_ROLE_IDS.map((id) => `<@&${id}>`).join(" ");

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

  await voiceChannel.send({ embeds: [embed], components: [row] });
  logger.info({ lobbyId, matchId }, "Replacement supervision request posted in Ranked VC chat");
}

export async function handleSupervisionReplace(
  supervisorId: string,
  lobbyId:      string,
  member:       GuildMember,
  client:       Client,
): Promise<void> {
  if (!hasSupervisionRole(member)) {
    throw new Error("No tienes ninguno de los roles de supervisor requeridos.");
  }

  const lobby = await lobbyRepository.findById(lobbyId);
  if (!lobby) throw new Error("Lobby no encontrado.");
  if (lobby.status !== LobbyStatus.InGame) {
    throw new Error("Esta partida no está en curso o ya tiene un supervisor activo.");
  }

  await lobbyRepository.updateSupervisor(lobbyId, supervisorId, new Date());

  const partida = await matchRepository.findByLobbyId(lobbyId);
  if (partida) {
    await matchRepository.updateMatchDetails(partida.id, { supervisorId });
  }

  if (lobby.voiceChannelId) {
    try {
      await member.voice.setChannel(lobby.voiceChannelId, "Replacement supervisor joining ranked match");
    } catch {}
  }

  eventBus.emit("supervisor:replaced", { lobbyId, supervisorId });
  logger.info({ lobbyId, supervisorId }, "Supervisor replaced in-game");

  void client;
}

// Helpers

export function hasSupervisionRole(member: GuildMember): boolean {
  return member.roles.cache.some((role) =>
    (SUPERVISOR_ROLE_IDS as readonly string[]).includes(role.id),
  );
}