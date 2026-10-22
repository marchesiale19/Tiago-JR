
import {
  Events,
  type Client,
  type VoiceState,
} from "discord.js";

const REQUIRED_PRESENT_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 5_000;

const ALLOWED_VOICE_CHANNEL_IDS = new Set([
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

const presenceStartedAt = new Map<string, number>();
const completedUsers = new Set<string>();

function getUserKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function isAllowed(channelId: string | null): boolean {
  return (
    channelId !== null &&
    ALLOWED_VOICE_CHANNEL_IDS.has(channelId)
  );
}

function getEligibleUsers(
  client: Client,
  guildId: string,
): Set<string> {
  const guild = client.guilds.cache.get(guildId);
  const users = new Set<string>();

  if (!guild) return users;

  for (const state of guild.voiceStates.cache.values()) {
    if (state.member?.user.bot) continue;
    if (!isAllowed(state.channelId)) continue;

    users.add(state.id);
  }

  return users;
}

function resetGuildPresence(guildId: string): void {
  const prefix = `${guildId}:`;

  for (const key of presenceStartedAt.keys()) {
    if (key.startsWith(prefix)) {
      presenceStartedAt.delete(key);
    }
  }

  for (const key of completedUsers) {
    if (key.startsWith(prefix)) {
      completedUsers.delete(key);
    }
  }
}

function checkPresence(client: Client, guildId: string): void {
  const users = getEligibleUsers(client, guildId);
  const now = Date.now();

  if (users.size < 2) {
    resetGuildPresence(guildId);
    return;
  }

  // El contador individual solo avanza mientras haya
  // al menos dos humanos en canales autorizados.
  for (const userId of users) {
    const key = getUserKey(guildId, userId);

    if (completedUsers.has(key)) continue;

    if (!presenceStartedAt.has(key)) {
      presenceStartedAt.set(key, now);
      continue;
    }

    const startedAt = presenceStartedAt.get(key)!;

    if (now - startedAt >= REQUIRED_PRESENT_MS) {
      completedUsers.add(key);
      presenceStartedAt.delete(key);

      console.log(
        `[VoiceStreaks] ${userId} completó 5 minutos de presencia válida en ${guildId}.`,
      );

      // Próximo paso: registrar la asistencia en la base de datos.
    }
  }

  // Si un usuario sale de los canales autorizados,
  // pierde su contador de presencia actual.
  for (const key of presenceStartedAt.keys()) {
    if (!key.startsWith(`${guildId}:`)) continue;

    const userId = key.slice(guildId.length + 1);

    if (!users.has(userId)) {
      presenceStartedAt.delete(key);
      completedUsers.delete(key);
    }
  }
}

function handleVoiceUpdate(
  client: Client,
  oldState: VoiceState,
  newState: VoiceState,
): void {
  if (oldState.guild.id !== newState.guild.id) return;

  checkPresence(client, newState.guild.id);
}

export function setupVoiceStreaks(client: Client): void {
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    handleVoiceUpdate(client, oldState, newState);
  });

  const initialize = (): void => {
    for (const guild of client.guilds.cache.values()) {
      checkPresence(client, guild.id);
    }

    setInterval(() => {
      for (const guild of client.guilds.cache.values()) {
        checkPresence(client, guild.id);
      }
    }, CHECK_INTERVAL_MS);

    console.log(
      `[VoiceStreaks] Seguimiento iniciado. VC autorizados: ${ALLOWED_VOICE_CHANNEL_IDS.size}.`,
    );
  };

  if (client.isReady()) {
    initialize();
  } else {
    client.once(Events.ClientReady, initialize);
  }
}
