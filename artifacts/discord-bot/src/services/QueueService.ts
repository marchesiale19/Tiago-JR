// xandel se la come
import { Client, Guild } from "discord.js";
import { lobbyRepository }  from "../database/repositories/LobbyRepository";
import { LobbyStatus, CompetitiveState } from "../database/enums";
import { getUserCompetitiveState, getOrCreateQueueLobby, transitionTo } from "./LobbyService";
import { sendSupervisionRequest } from "./SupervisorService";
import { getOrCreateRankedVC, movePlayersToVC } from "./RankedVCService";
import { eventBus } from "./EventBus";
import { logger } from "../lib/logger";
const QUEUE_SIZE = 14;
const AMONG_US_VOICE_CHANNELS = [
  "1452030683588333568",
  "1478541699041984583",
  "1452030713791774882",
  "1452030742602453174",
  "1452174467441627208",
  "1462162035185029356",
  "1462517911607316480",
  "1478541393470292211",
  "1478541114695749702",
  "1499495604680917124",
  "1538256157347418183"
];
export interface JoinResult {
  joined:  boolean;
  reason?: string;
  count:   number;
  max:     number;
}
export async function joinQueue(
  discordId:        string,
  guildId:          string,
  client:           Client,
  voiceChannelId:   string | null | undefined,
): Promise<JoinResult> {
  if (!voiceChannelId || !AMONG_US_VOICE_CHANNELS.includes(voiceChannelId)) {
    return {
      joined: false,
      reason: "Debes estar conectado a un canal de voz autorizado de Among Us para buscar partida.",
      count:  0,
      max:    QUEUE_SIZE,
    };
  }
  const state = await getUserCompetitiveState(discordId);
  if (state !== CompetitiveState.Libre) {
    return { joined: false, reason: stateMessage(state), count: 0, max: QUEUE_SIZE };
  }
  const lobby = await getOrCreateQueueLobby(guildId, discordId);
  if (lobby.status !== LobbyStatus.Queue) {
    return {
      joined: false,
      reason: "La cola se está procesando. Inténtalo de nuevo en un momento.",
      count:  0,
      max:    QUEUE_SIZE,
    };
  }
  try {
    await lobbyRepository.addParticipant({ lobbyId: lobby.id, discordId });
  } catch (err: any) {
    if (err?.code === "23505") {
      return {
        joined: false,
        reason: "Ya estás en la cola.",
        count:  await lobbyRepository.countParticipants(lobby.id),
        max:    QUEUE_SIZE,
      };
    }
    throw err;
  }
  const count = await lobbyRepository.countParticipants(lobby.id);
  logger.info({ discordId, lobbyId: lobby.id, count, max: QUEUE_SIZE }, "Player joined queue");
  eventBus.emit("player:joined_queue", { discordId, lobbyId: lobby.id });
  if (count >= QUEUE_SIZE) {
    await onQueueFull(lobby.id, guildId, client);
  }
  return { joined: true, count, max: QUEUE_SIZE };
}
export async function leaveQueue(discordId: string): Promise<{ left: boolean; reason?: string }> {
  const state = await getUserCompetitiveState(discordId);
  if (state !== CompetitiveState.EnCola) {
    return { left: false, reason: "No estás en la cola." };
  }
  const lobby = await lobbyRepository.findQueueLobby();
  if (!lobby) return { left: false, reason: "No hay cola activa." };
  await lobbyRepository.removeParticipant(lobby.id, discordId);
  const count = await lobbyRepository.countParticipants(lobby.id);
  logger.info({ discordId, lobbyId: lobby.id, count }, "Player left queue");
  eventBus.emit("player:left_queue", { discordId, lobbyId: lobby.id });
  return { left: true };
}
export async function getQueueStatus(): Promise<{
  lobby:  Awaited<ReturnType<typeof lobbyRepository.findQueueLobby>>;
  count:  number;
  max:    number;
}> {
  const lobby = await lobbyRepository.findQueueLobby();
  const count = lobby ? await lobbyRepository.countParticipants(lobby.id) : 0;
  return { lobby, count, max: QUEUE_SIZE };
}
async function onQueueFull(lobbyId: string, guildId: string, client: Client): Promise<void> {
  logger.info({ lobbyId }, "Queue full — starting ranked match flow");
  const participants   = await lobbyRepository.listParticipants(lobbyId);
  const participantIds = participants.map((p) => p.discordId);
  await transitionTo(lobbyId, LobbyStatus.WaitingSupervisor);
  eventBus.emit("queue:full", { lobbyId, guildId, participantIds });
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    logger.error({ guildId }, "Guild not found — cannot start ranked match");
    return;
  }
  let rankedVC;
  try {
    rankedVC = await getOrCreateRankedVC(guild);
  } catch (err) {
    logger.error({ err }, "Failed to get/create Ranked VC");
    return;
  }
  await lobbyRepository.updateChannels(lobbyId, "", rankedVC.id);
  await guild.members.fetch();
  const { moved, skipped } = await movePlayersToVC(guild, rankedVC.id, participantIds);
  logger.info({ lobbyId, moved: moved.length, skipped: skipped.length }, "Players moved to Ranked VC");
  await sendSupervisionRequest(lobbyId, guildId, rankedVC.id, rankedVC.name, client);
}
function stateMessage(state: CompetitiveState): string {
  switch (state) {
    case CompetitiveState.EnCola:    return "Ya estás en la cola.";
    case CompetitiveState.EnLobby:   return "Ya estás en un lobby en preparación.";
    case CompetitiveState.EnPartida: return "Ya estás en una partida activa.";
    default:                         return "Estado desconocido.";
  }
}