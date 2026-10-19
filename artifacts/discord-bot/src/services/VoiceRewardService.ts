
import {
  Events,
  type Client,
  type VoiceState,
} from "discord.js";
import { and, eq } from "drizzle-orm";

import { db } from "@workspace/db";
import { voiceRewardsTable } from "@workspace/db/schema";
import { unb } from "../lib/unbelievaboat";

const REWARD_SECONDS = 60 * 60;
const REWARD_AMOUNT = 50_000;
const CHECK_INTERVAL_MS = 60_000;

// Serializa las operaciones de cada usuario para evitar
// que un evento de voz y el temporizador procesen a la vez.
const userLocks = new Map<string, Promise<void>>();

function getKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

async function withUserLock<T>(
  key: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = userLocks.get(key) ?? Promise.resolve();

  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  userLocks.set(key, current);
  await previous;

  try {
    return await task();
  } finally {
    release();

    if (userLocks.get(key) === current) {
      userLocks.delete(key);
    }
  }
}

async function getRecord(guildId: string, userId: string) {
  const rows = await db
    .select()
    .from(voiceRewardsTable)
    .where(
      and(
        eq(voiceRewardsTable.guildId, guildId),
        eq(voiceRewardsTable.userId, userId),
      ),
    )
    .limit(1);

  return rows[0];
}

async function ensureSession(
  guildId: string,
  userId: string,
): Promise<void> {
  const record = await getRecord(guildId, userId);
  const now = new Date();

  if (record) {
    if (record.sessionStartedAt === null) {
      await db
        .update(voiceRewardsTable)
        .set({
          sessionStartedAt: now,
          updatedAt: now,
        })
        .where(eq(voiceRewardsTable.id, record.id));
    }

    return;
  }

  await db.insert(voiceRewardsTable).values({
    guildId,
    userId,
    accumulatedSeconds: 0,
    sessionStartedAt: now,
    updatedAt: now,
  });
}

/**
 * Avisa en el chat integrado del canal de voz actual.
 * Los canales de voz no siempre exponen un método send()
 * en discord.js; en ese caso se deja constancia en los logs.
 */
async function notifyVoiceReward(
  client: Client,
  guildId: string,
  userId: string,
): Promise<void> {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const member = await guild.members.fetch(userId);
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      console.warn(
        `[VoiceRewards] ${userId} ya no está en voz; no se pudo enviar el aviso.`,
      );
      return;
    }

    // El chat integrado de voz depende del tipo de canal
    // y de las capacidades expuestas por la versión de discord.js.
    const sendableChannel = voiceChannel as typeof voiceChannel & {
      send?: (options: {
        content: string;
        allowedMentions?: { users: string[] };
      }) => Promise<unknown>;
    };

    if (typeof sendableChannel.send !== "function") {
      console.warn(
        `[VoiceRewards] El canal ${voiceChannel.id} no expone send(); no se envió el aviso.`,
      );
      return;
    }

    await sendableChannel.send({
     content:
  `🎉 **¡Ganaste una recompensa!**\n\n` +
  `¡<@${userId}>! Recibiste **${REWARD_AMOUNT.toLocaleString("es-AR")} <:MonedaServer:1524674026188967956>** ` +
  `en tu banco del <#1483361912904224799> por completar una hora en canales de voz. ¡Seguí así! 🎧`,
      allowedMentions: { users: [userId] },
    });

    console.log(
      `[VoiceRewards] Aviso enviado al canal de voz para ${userId}.`,
    );
  } catch (error) {
    console.warn(
      `[VoiceRewards] No se pudo enviar el aviso al canal de voz para ${userId}:`,
      error,
    );
  }
}

/**
 * Calcula el progreso actual y lo guarda antes de intentar
 * pagar. Los segundos pendientes permanecen en la tabla
 * si la API falla.
 */
async function accrueTime(
  client: Client,
  guildId: string,
  userId: string,
  sessionActive: boolean,
): Promise<void> {
  const record = await getRecord(guildId, userId);
  if (!record) return;

  const now = new Date();
  let totalSeconds = record.accumulatedSeconds;

  if (record.sessionStartedAt !== null) {
    const elapsedSeconds = Math.max(
      0,
      Math.floor(
        (now.getTime() - record.sessionStartedAt.getTime()) / 1000,
      ),
    );

    totalSeconds += elapsedSeconds;
  }

  await db
    .update(voiceRewardsTable)
    .set({
      accumulatedSeconds: totalSeconds,
      sessionStartedAt: sessionActive ? now : null,
      updatedAt: now,
    })
    .where(eq(voiceRewardsTable.id, record.id));

  await payPendingRewards(client, guildId, userId);
}

/**
 * Paga las horas pendientes una por una y registra cada pago.
 */
async function payPendingRewards(
  client: Client,
  guildId: string,
  userId: string,
): Promise<void> {
  while (true) {
    const record = await getRecord(guildId, userId);

    if (!record || record.accumulatedSeconds < REWARD_SECONDS) {
      return;
    }

    // Acreditar el dinero en el banco de UnbelievaBoat.
    await unb.editUserBalance(guildId, userId, {
      bank: REWARD_AMOUNT,
    });

    // Descontar una hora del saldo pendiente.
    const updated = await db
      .update(voiceRewardsTable)
      .set({
        accumulatedSeconds:
          record.accumulatedSeconds - REWARD_SECONDS,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(voiceRewardsTable.id, record.id),
          eq(
            voiceRewardsTable.accumulatedSeconds,
            record.accumulatedSeconds,
          ),
        ),
      )
      .returning({ id: voiceRewardsTable.id });

    if (updated.length === 0) {
      throw new Error(
        `No se pudo confirmar el pago de voz para ${userId}.`,
      );
    }

    console.log(
      `[VoiceRewards] ${userId} recibió ${REWARD_AMOUNT} en el banco.`,
    );

    // El aviso es independiente del pago: si falla, no se
    // revierte ni se vuelve a acreditar la recompensa.
    await notifyVoiceReward(client, guildId, userId);
  }
}

async function handleVoiceUpdate(
  client: Client,
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  const guildId = newState.guild.id;
  const userId = newState.id;

  if (newState.member?.user.bot) return;
  if (oldState.channelId === newState.channelId) return;

  await withUserLock(getKey(guildId, userId), async () => {
    // Entrada a voz.
    if (!oldState.channelId && newState.channelId) {
      await ensureSession(guildId, userId);
      await payPendingRewards(client, guildId, userId);

      console.log(
        `[VoiceRewards] ${userId} entró a voz en ${guildId}.`,
      );
      return;
    }

    // Salida de voz.
    if (oldState.channelId && !newState.channelId) {
      await accrueTime(client, guildId, userId, false);

      console.log(
        `[VoiceRewards] ${userId} salió de voz en ${guildId}.`,
      );
      return;
    }

    // Cambio de canal: la sesión continúa.
    if (oldState.channelId && newState.channelId) {
      console.log(
        `[VoiceRewards] ${userId} cambió de canal en ${guildId}.`,
      );
    }
  });
}

async function checkUser(
  client: Client,
  guildId: string,
  userId: string,
): Promise<void> {
  await withUserLock(getKey(guildId, userId), async () => {
    const guild = client.guilds.cache.get(guildId);
    const voiceState = guild?.voiceStates.cache.get(userId);

    if (!guild || !voiceState?.channelId) return;
    if (voiceState.member?.user.bot) return;

    const record = await getRecord(guildId, userId);

    if (!record) {
      await ensureSession(guildId, userId);
      return;
    }

    await accrueTime(client, guildId, userId, true);
  });
}

async function recoverConnectedUsers(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    for (const state of guild.voiceStates.cache.values()) {
      if (!state.channelId || state.member?.user.bot) continue;

      await withUserLock(
        getKey(guild.id, state.id),
        async () => {
          const record = await getRecord(guild.id, state.id);

          if (!record) {
            await ensureSession(guild.id, state.id);
            return;
          }

          // No contar todo el tiempo que Render estuvo apagado.
          const now = new Date();
          let recoveredSeconds = record.accumulatedSeconds;

          if (record.sessionStartedAt !== null) {
            const elapsed = Math.max(
              0,
              Math.floor(
                (now.getTime() -
                  record.sessionStartedAt.getTime()) /
                  1000,
              ),
            );

            recoveredSeconds += Math.min(
              elapsed,
              CHECK_INTERVAL_MS / 1000,
            );
          }

          await db
            .update(voiceRewardsTable)
            .set({
              accumulatedSeconds: recoveredSeconds,
              sessionStartedAt: now,
              updatedAt: now,
            })
            .where(eq(voiceRewardsTable.id, record.id));

          await payPendingRewards(client, guild.id, state.id);
        },
      );
    }
  }
}

export function setupVoiceRewards(client: Client): void {
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    void handleVoiceUpdate(client, oldState, newState).catch((error) => {
      console.error(
        "[VoiceRewards] Error procesando estado de voz:",
        error,
      );
    });
  });

  const initialize = (): void => {
    void recoverConnectedUsers(client).catch((error) => {
      console.error(
        "[VoiceRewards] Error recuperando sesiones:",
        error,
      );
    });

    setInterval(() => {
      for (const guild of client.guilds.cache.values()) {
        for (const state of guild.voiceStates.cache.values()) {
          if (!state.channelId || state.member?.user.bot) continue;

          void checkUser(client, guild.id, state.id).catch((error) => {
            console.error(
              `[VoiceRewards] Error comprobando a ${state.id}:`,
              error,
            );
          });
        }
      }
    }, CHECK_INTERVAL_MS);

    console.log("[VoiceRewards] Contador de voz iniciado.");
  };

  if (client.isReady()) {
    initialize();
  } else {
    client.once(Events.ClientReady, initialize);
  }
}
