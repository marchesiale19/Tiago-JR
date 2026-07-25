// ---------------------------------------------------------------------------
// SupervisorService — FIFO supervisor assignment, timeout, rollover.
// Availability is managed here; state transitions are delegated to LobbyService.
// ---------------------------------------------------------------------------

import {
  Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from "discord.js";
import { supervisorRepository } from "../database/repositories/SupervisorRepository";
import { lobbyRepository } from "../database/repositories/LobbyRepository";
import { LobbyStatus } from "../database/enums";
import { getConfigInt } from "./ConfigService";
import { ConfigKey } from "../database/enums";
import { transitionTo, createMatchChannels } from "./LobbyService";
import { eventBus } from "./EventBus";
import { logger } from "../lib/logger";

// In-memory timeout registry (reset on restart; recovery handles stale states)
const pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

// ── Availability management ────────────────────────────────────────────────

export async function setAvailable(discordId: string): Promise<void> {
  await supervisorRepository.setDisponible(discordId, true);
  logger.info({ discordId }, "Supervisor marked disponible");
}

export async function setUnavailable(discordId: string): Promise<void> {
  await supervisorRepository.setDisponible(discordId, false);
  logger.info({ discordId }, "Supervisor marked no disponible");
}

// ── FIFO assignment ────────────────────────────────────────────────────────

export async function assignNextSupervisor(
  lobbyId: string,
  client: Client,
): Promise<void> {
  const supervisor = await supervisorRepository.findNextAvailable();

  if (!supervisor) {
    logger.warn({ lobbyId }, "No available supervisors — lobby remains in WAITING_SUPERVISOR");
    // Notify original text channel if stored
    const lobby = await lobbyRepository.findById(lobbyId);
    if (lobby?.channelId && lobby.guildId) {
      try {
        const guild = await client.guilds.fetch(lobby.guildId);
        const ch = guild.channels.cache.get(lobby.channelId);
        if (ch?.isTextBased()) {
          await (ch as any).send(
            "⚠️ No hay supervisores disponibles en este momento. La cola permanecerá en espera.",
          );
        }
      } catch { /* best effort */ }
    }
    return;
  }

  // Mark supervisor occupied and record assignment on lobby
  await supervisorRepository.setOcupado(supervisor.discordId, true);
  await lobbyRepository.updateSupervisor(lobbyId, supervisor.discordId, new Date());

  // Notify supervisor via DM
  try {
    const user = await client.users.fetch(supervisor.discordId);
    const lobby = await lobbyRepository.findById(lobbyId);
    const count = lobby ? await lobbyRepository.countParticipants(lobby.id) : 0;

    const embed = new EmbedBuilder()
      .setColor("Yellow")
      .setTitle("🎯 Solicitud de supervisión")
      .setDescription(`Se necesita un supervisor para una partida con **${count} jugadores**.`)
      .addFields({ name: "Lobby ID", value: lobbyId, inline: true })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`lobby_accept_${lobbyId}`)
        .setLabel("✅ Aceptar")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`lobby_reject_${lobbyId}`)
        .setLabel("❌ Rechazar")
        .setStyle(ButtonStyle.Danger),
    );

    await user.send({ embeds: [embed], components: [row] });
    logger.info({ lobbyId, supervisorId: supervisor.discordId }, "Supervisor notified");
    eventBus.emit("supervisor:notified", { lobbyId, supervisorId: supervisor.discordId });
  } catch (err) {
    logger.error({ err, supervisorId: supervisor.discordId }, "Could not DM supervisor — rolling over");
    await rollOver(lobbyId, supervisor.discordId, client);
    return;
  }

  // Start timeout
  startTimeout(lobbyId, supervisor.discordId, client);
}

function startTimeout(
  lobbyId: string,
  supervisorId: string,
  client: Client,
): void {
  cancelTimeout(lobbyId);

  getConfigInt(ConfigKey.SupervisorTimeoutSeconds, 120).then((seconds) => {
    const timer = setTimeout(async () => {
      logger.warn({ lobbyId, supervisorId }, "Supervisor acceptance timed out — rolling over");
      eventBus.emit("supervisor:timed_out", { lobbyId, supervisorId });
      await rollOver(lobbyId, supervisorId, client);
    }, seconds * 1000);
    pendingTimeouts.set(lobbyId, timer);
  });
}

export function cancelTimeout(lobbyId: string): void {
  const timer = pendingTimeouts.get(lobbyId);
  if (timer) {
    clearTimeout(timer);
    pendingTimeouts.delete(lobbyId);
  }
}

/** Called when supervisor rejects or times out — free them up and try next. */
async function rollOver(
  lobbyId: string,
  supervisorId: string,
  client: Client,
): Promise<void> {
  cancelTimeout(lobbyId);
  await supervisorRepository.setOcupado(supervisorId, false);
  // Clear supervisor from lobby so next assignment is clean
  await lobbyRepository.updateSupervisor(lobbyId, "", new Date());
  eventBus.emit("supervisor:rejected", { lobbyId, supervisorId });
  await assignNextSupervisor(lobbyId, client);
}

// ── Accept / Reject handlers ───────────────────────────────────────────────

export async function handleAccept(
  supervisorId: string,
  lobbyId: string,
  client: Client,
): Promise<void> {
  const lobby = await lobbyRepository.findById(lobbyId);

  if (!lobby) throw new Error("Lobby not found");
  if (lobby.status !== LobbyStatus.WaitingSupervisor) {
    throw new Error("Lobby is no longer awaiting a supervisor");
  }
  if (lobby.supervisorId !== supervisorId) {
    throw new Error("You are not the assigned supervisor for this lobby");
  }

  cancelTimeout(lobbyId);

  // Transition to READY
  await transitionTo(lobbyId, LobbyStatus.Ready);

  // Create Discord channels
  const guild = await client.guilds.fetch(lobby.guildId!);
  await guild.members.fetch(); // ensure member cache is populated
  const participants = await lobbyRepository.listParticipants(lobbyId);
  const participantIds = participants.map((p) => p.discordId);

  const { textChannelId } = await createMatchChannels(
    lobbyId, guild, supervisorId, participantIds,
  );

  // Notify in the new channel
  try {
    const ch = guild.channels.cache.get(textChannelId);
    if (ch?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor("Green")
        .setTitle("✅ ¡Partida lista!")
        .setDescription("El supervisor ha aceptado. La partida puede comenzar cuando el supervisor lo indique.")
        .addFields({ name: "Supervisor", value: `<@${supervisorId}>`, inline: true })
        .setTimestamp();
      await (ch as any).send({ embeds: [embed] });
    }
  } catch { /* best effort */ }

  eventBus.emit("supervisor:accepted", { lobbyId, supervisorId });
  logger.info({ lobbyId, supervisorId }, "Supervisor accepted — lobby READY");
}

export async function handleReject(
  supervisorId: string,
  lobbyId: string,
  client: Client,
): Promise<void> {
  const lobby = await lobbyRepository.findById(lobbyId);
  if (!lobby || lobby.supervisorId !== supervisorId) return;
  if (lobby.status !== LobbyStatus.WaitingSupervisor) return;

  logger.info({ lobbyId, supervisorId }, "Supervisor rejected assignment");
  await rollOver(lobbyId, supervisorId, client);
}
