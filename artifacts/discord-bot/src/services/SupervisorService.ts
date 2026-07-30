// ---------------------------------------------------------------------------
// SupervisorService — Supervision request embed + button-based acceptance.
//
// New flow (replaces FIFO DM assignment):
//   1. sendSupervisionRequest() — posts a public embed in the supervision channel
//      mentioning the supervisor roles.  Any eligible staff member can press the
//      "Accept Supervision" button.
//   2. handleSupervisionAccept() — called from index.ts when the button is pressed.
//      First eligible press wins; lobby transitions immediately to InGame.
//
// "Eligible" = the pressing user has at least one of the named supervisor roles.
// ---------------------------------------------------------------------------

import {
  Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  type Guild, type GuildMember,
} from "discord.js";
import { lobbyRepository }  from "../database/repositories/LobbyRepository";
import { matchRepository }  from "../database/repositories/MatchRepository";
import { LobbyStatus }      from "../database/enums";
import { transitionTo }     from "./LobbyService";
import { startMatch }       from "./MatchService";
import { getConfig }        from "./ConfigService";
import { ConfigKey }        from "../database/enums";
import { eventBus }         from "./EventBus";
import { logger }           from "../lib/logger";

// Role names that are allowed to supervise (in hierarchical order)
export const SUPERVISOR_ROLE_NAMES = [
  "Moderador",
  "Moderador [PB]",
  "Helper",
  "Trial Helper",
  "Supervisor",
] as const;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Post a supervision request embed in the configured supervision channel.
 * Mentions all supervisor roles and provides a green "Accept Supervision" button.
 */
export async function sendSupervisionRequest(
  lobbyId:    string,
  guildId:    string,
  vcId:       string,
  vcName:     string,
  client:     Client,
): Promise<void> {
  const supervisionChannelId = await getConfig(ConfigKey.SupervisionChannelId);
  if (!supervisionChannelId) {
    logger.warn({ lobbyId }, "SUPERVISION_CHANNEL_ID not configured — supervision request not sent");
    return;
  }

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  // Resolve role mentions
  await guild.roles.fetch();
  const roleMentions = SUPERVISOR_ROLE_NAMES
    .map((name) => {
      const role = guild.roles.cache.find((r) => r.name === name);
      return role ? `<@&${role.id}>` : name;
    })
    .join(" ");

  const participantCount = await lobbyRepository.countParticipants(lobbyId);

  const embed = new EmbedBuilder()
    .setColor("Green")
    .setTitle("🎮 Se necesita un supervisor")
    .setDescription(
      `${roleMentions}\n\n` +
      `Una partida de **${participantCount} jugadores** está lista en el canal <#${vcId}>.\n\n` +
      "El primer supervisor en aceptar se unirá como **jugador #15** y tendrá acceso a los comandos de partida.",
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

  const channel = guild.channels.cache.get(supervisionChannelId);
  if (!channel?.isTextBased()) {
    logger.warn({ supervisionChannelId }, "Supervision channel not found or not text-based");
    return;
  }

  await (channel as any).send({ embeds: [embed], components: [row] });
  logger.info({ lobbyId, supervisionChannelId }, "Supervision request posted");
}

/**
 * Handle a "Accept Supervision" button press.
 * Validates eligibility, transitions the lobby, starts the match.
 * Returns the match ID on success.
 */
export async function handleSupervisionAccept(
  supervisorId: string,
  lobbyId:      string,
  member:       GuildMember,
  client:       Client,
): Promise<void> {
  // Check eligibility
  if (!hasSupervisionRole(member)) {
    throw new Error("No tienes ninguno de los roles de supervisor requeridos.");
  }

  // Load and validate lobby
  const lobby = await lobbyRepository.findById(lobbyId);
  if (!lobby) throw new Error("Lobby no encontrado.");
  if (lobby.status !== LobbyStatus.WaitingSupervisor) {
    throw new Error("Este lobby ya tiene un supervisor asignado o no está disponible.");
  }

  // Claim the lobby
  await lobbyRepository.updateSupervisor(lobbyId, supervisorId, new Date());
  await transitionTo(lobbyId, LobbyStatus.Ready);

  // Move supervisor into the Ranked VC
  if (lobby.voiceChannelId) {
    try {
      await member.voice.setChannel(lobby.voiceChannelId, "Supervisor joining ranked match");
    } catch {
      // Not fatal — supervisor might not be in a VC; they can join manually
    }
  }

  // Start the match (READY → IN_GAME, creates partida, snapshots ELOs)
  await startMatch(lobbyId, supervisorId, client);

  eventBus.emit("supervisor:accepted", { lobbyId, supervisorId });
  logger.info({ lobbyId, supervisorId }, "Supervision accepted — match started");
}

/** Post a NEW supervision request for an ongoing match (supervisor replacement). */
export async function sendReplacementSupervisionRequest(
  matchId:    string,
  lobbyId:    string,
  guildId:    string,
  client:     Client,
): Promise<void> {
  const lobby = await lobbyRepository.findById(lobbyId);
  if (!lobby) throw new Error("Lobby no encontrado.");

  const vcId   = lobby.voiceChannelId ?? "";
  const vcName = vcId ? `<#${vcId}>` : "—";

  const supervisionChannelId = await getConfig(ConfigKey.SupervisionChannelId);
  if (!supervisionChannelId) throw new Error("SUPERVISION_CHANNEL_ID no configurado.");

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) throw new Error("Servidor no encontrado.");

  await guild.roles.fetch();
  const roleMentions = SUPERVISOR_ROLE_NAMES
    .map((name) => {
      const role = guild.roles.cache.find((r) => r.name === name);
      return role ? `<@&${role.id}>` : name;
    })
    .join(" ");

  const embed = new EmbedBuilder()
    .setColor("Yellow")
    .setTitle("⚠️ Supervisor inactivo — Se necesita reemplazo")
    .setDescription(
      `${roleMentions}\n\n` +
      `El supervisor de la partida \`${matchId.slice(0, 8)}\` está inactivo.\n` +
      `Canal: ${vcName}\n\n` +
      "El primer supervisor en aceptar tomará el control de la partida.",
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`supervision_replace_${lobbyId}`)
      .setLabel("✅ Aceptar Supervisión")
      .setStyle(ButtonStyle.Success),
  );

  const channel = guild.channels.cache.get(supervisionChannelId);
  if (!channel?.isTextBased()) throw new Error("Canal de supervisión no encontrado.");

  await (channel as any).send({ embeds: [embed], components: [row] });
  logger.info({ lobbyId, matchId }, "Replacement supervision request posted");
}

/**
 * Handle a "Replace Supervisor" button press on an in-game lobby.
 * Reassigns the supervisor without restarting the match.
 */
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

  // Reassign supervisor on lobby
  await lobbyRepository.updateSupervisor(lobbyId, supervisorId, new Date());

  // Reassign supervisor on the active match record
  const partida = await matchRepository.findByLobbyId(lobbyId);
  if (partida) {
    await matchRepository.updateMatchDetails(partida.id, { supervisorId });
  }

  // Move new supervisor into the Ranked VC if possible
  if (lobby.voiceChannelId) {
    try {
      await member.voice.setChannel(lobby.voiceChannelId, "Replacement supervisor joining ranked match");
    } catch {
      // Not fatal — supervisor can join manually
    }
  }

  eventBus.emit("supervisor:replaced", { lobbyId, supervisorId });
  logger.info({ lobbyId, supervisorId }, "Supervisor replaced in-game");

  // Suppress unused-variable warning for client (kept for API symmetry)
  void client;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function hasSupervisionRole(member: GuildMember): boolean {
  return member.roles.cache.some((role) =>
    (SUPERVISOR_ROLE_NAMES as readonly string[]).includes(role.name),
  );
}
