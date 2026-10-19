
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
    // No reiniciar una sesión que ya está en marcha.
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
 * Calcula el progreso actual y lo guarda antes de intentar
 * pagar. Los segundos pendientes de pago permanecen en la tabla
 * si la API falla, de modo que el sistema pueda reintentarlo.
 */
async function accrueTime(
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

  // Persistir el progreso calculado antes de llamar a la API.
  await db
    .update(voiceRewardsTable)
    .set({
      accumulatedSeconds: totalSeconds,
      sessionStartedAt: sessionActive ? now : null,
      updatedAt: now,
    })
    .where(eq(voiceRewardsTable.id, record.id));

  await payPendingRewards(guildId, userId);
}

/**
 * Paga las horas pendientes una por una y registra cada pago
 * completado. Si la API falla, el progreso pendiente se conserva
 * para que pueda reintentarse en la próxima comprobación.
 */
async function payPendingRewards(
  guildId: string,
  userId: string,
): Promise<void> {
  while (true) {
    const record = await getRecord(guildId, userId);
    if (!record || record.accumulatedSeconds < REWARD_SECONDS) {
      return;
    }

    // Primero se acredita el banco en UnbelievaBoat.
    await unb.editUserBalance(guildId, userId, {
      bank: REWARD_AMOUNT,
    });

    // Después se descuenta una hora del saldo pendiente.
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
  }
}

async function handleVoiceUpdate(
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
      await payPendingRewards(guildId, userId);

      console.log(
        `[VoiceRewards] ${userId} entró a voz en ${guildId}.`,
      );
      return;
    }

    // Salida de voz: guardar el tiempo final y pagar las horas
    // completas que hayan quedado pendientes.
    if (oldState.channelId && !newState.channelId) {
      await accrueTime(guildId, userId, false);

      console.log(
        `[VoiceRewards] ${userId} salió de voz en ${guildId}.`,
      );
      return;
    }

    // Cambio de canal: la sesión sigue activa y no se reinicia.
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

    await accrueTime(guildId, userId, true);
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
          // Recuperar como máximo un minuto desde el último registro.
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

          await payPendingRewards(guild.id, state.id);
        },
      );
    }
  }
}

export function setupVoiceRewards(client: Client): void {
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    void handleVoiceUpdate(oldState, newState).catch((error) => {
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

  // Compatible tanto si el servicio se configura antes de Ready
  // como si index.ts lo configura después de que el bot esté listo.
  if (client.isReady()) {
    initialize();
  } else {
    client.once(Events.ClientReady, initialize);
  }
}
