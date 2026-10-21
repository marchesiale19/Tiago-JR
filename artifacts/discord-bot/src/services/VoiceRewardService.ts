
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
const REWARD_AMOUNT = 40_000;
const CHECK_INTERVAL_MS = 60_000;

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

// Serializa las operaciones de cada usuario.
const userLocks = new Map<string, Promise<void>>();

function getKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function isAllowedVoiceChannel(channelId: string | null): boolean {
  return (
    channelId !== null &&
    ALLOWED_VOICE_CHANNEL_IDS.has(channelId)
  );
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

/**
 * Crea el registro si no existe.
 * Una sesión solo empieza o continúa cuando el usuario
 * está en un canal autorizado.
 */
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
 * Envía el aviso de recompensa por mensaje privado.
 */
async function notifyVoiceReward(
  client: Client,
  guildId: string,
  userId: string,
): Promise<void> {
  try {
    const user = await client.users.fetch(userId);

    await user.send({
      content:
        `🎉 **¡Ganaste una recompensa!**\n\n` +
        `¡Recibiste **${REWARD_AMOUNT.toLocaleString("es-AR")} <:MonedaServer:1524674026188967956>** ` +
        `en tu banco del <#1483361912904224799> por completar una hora en canales de voz. ¡Seguí así! 🎧`,
    });

    console.log(
      `[VoiceRewards] Aviso privado enviado a ${userId}.`,
    );
  } catch (error) {
    console.warn(
      `[VoiceRewards] No se pudo enviar el aviso privado a ${userId}:`,
      error,
    );
  }
}

/**
 * Guarda el tiempo transcurrido únicamente de una sesión válida.
 * Si sessionActive es false, la sesión se pausa.
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
 * Paga las horas completas que estén pendientes.
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

    await unb.editUserBalance(guildId, userId, {
      bank: REWARD_AMOUNT,
    });

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

    await notifyVoiceReward(client, guildId, userId);
  }
}

/**
 * Maneja entradas, salidas y cambios entre canales.
 */
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
    const wasAllowed = isAllowedVoiceChannel(oldState.channelId);
    const isAllowed = isAllowedVoiceChannel(newState.channelId);

    // Sale de un VC permitido hacia uno no permitido,
    // o se desconecta: guardar el tiempo válido y pausar.
    if (wasAllowed && !isAllowed) {
      await accrueTime(client, guildId, userId, false);

      console.log(
        `[VoiceRewards] ${userId} salió de un VC autorizado en ${guildId}.`,
      );
      return;
    }

    // Entra a un VC permitido desde fuera del sistema
    // o desde un canal no autorizado.
    if (!wasAllowed && isAllowed) {
      await ensureSession(guildId, userId);
      await payPendingRewards(client, guildId, userId);

      console.log(
        `[VoiceRewards] ${userId} entró a un VC autorizado en ${guildId}.`,
      );
      return;
    }

    // Cambia entre dos VC autorizados: no reiniciar.
    if (wasAllowed && isAllowed) {
      console.log(
        `[VoiceRewards] ${userId} cambió entre VC autorizados en ${guildId}.`,
      );
    }

    // Los cambios entre canales no autorizados no cuentan.
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

    // No acumular ni iniciar sesiones en canales no permitidos.
    if (!isAllowedVoiceChannel(voiceState.channelId)) return;

    const record = await getRecord(guildId, userId);

    if (!record) {
      await ensureSession(guildId, userId);
      return;
    }

    await accrueTime(client, guildId, userId, true);
  });
}

/**
 * Recupera las sesiones de usuarios conectados después
 * de que el bot se reinicie, sin contar todo el tiempo
 * durante el cual Render estuvo apagado.
 */
async function recoverConnectedUsers(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    for (const state of guild.voiceStates.cache.values()) {
      if (!state.channelId || state.member?.user.bot) continue;

      await withUserLock(
        getKey(guild.id, state.id),
        async () => {
          const record = await getRecord(guild.id, state.id);
          const allowed = isAllowedVoiceChannel(state.channelId);

          if (!record) {
            if (allowed) {
              await ensureSession(guild.id, state.id);
            }
            return;
          }

          const now = new Date();
          let recoveredSeconds = record.accumulatedSeconds;

          // Recuperar como máximo un minuto desde el último registro
          // y solo si la sesión anterior estaba activa en un VC permitido.
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
              sessionStartedAt: allowed ? now : null,
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
          if (!isAllowedVoiceChannel(state.channelId)) continue;

          void checkUser(client, guild.id, state.id).catch((error) => {
            console.error(
              `[VoiceRewards] Error comprobando a ${state.id}:`,
              error,
            );
          });
        }
      }
    }, CHECK_INTERVAL_MS);

    console.log(
      `[VoiceRewards] Contador iniciado. VC autorizados: ${ALLOWED_VOICE_CHANNEL_IDS.size}.`,
    );
  };

  if (client.isReady()) {
    initialize();
  } else {
    client.once(Events.ClientReady, initialize);
  }
}
