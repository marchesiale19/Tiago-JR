import {
  Events,
  type Client,
  type VoiceState,
} from "discord.js";
import { and, eq } from "drizzle-orm";

import { db } from "@workspace/db";
import {
  voiceRewardsTable,
  missions,
  missionProgress,
} from "@workspace/db/schema";
import { unb } from "../lib/unbelievaboat";
import { getWeekKey } from "./mission.service";

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
    pendingRewardHours: 0,
    pendingRewardAmount: 0,
    sessionStartedAt: now,
    updatedAt: now,
  });
}

/**
 * Envía un único resumen privado cuando el usuario
 * termina su sesión de voz.
 *
 * Si falla el envío, conserva las recompensas pendientes.
 */
async function notifyVoiceReward(
  client: Client,
  guildId: string,
  userId: string,
): Promise<void> {
 const record = await getRecord(guildId, userId);

if (!record || record.pendingRewardHours <= 0) return;

const pendingRewardAmount = Number(
  record.pendingRewardAmount ?? 0,
);

try {
    const user = await client.users.fetch(userId);

    await user.send({
      content:
        `🎧 **¡Terminaste tu sesión de voz!**\n\n` +
        `⏱️ Tiempo recompensado: **${record.pendingRewardHours} horas**\n` +
        `💰 Dinero acumulado: **${pendingRewardAmount.toLocaleString("es-AR")} <:MonedaServer:1524674026188967956>**\n\n` +
        `¡Gracias por jugar en nuestros canales de voz! ❤️`,
    });

    await db
      .update(voiceRewardsTable)
      .set({
        pendingRewardHours: 0,
        pendingRewardAmount: 0,
        updatedAt: new Date(),
      })
     .where(
  eq(voiceRewardsTable.id, record.id),
);

    console.log(
      `[VoiceRewards] Resumen enviado a ${userId}: ` +
      `${record.pendingRewardHours} horas, ` +
`${pendingRewardAmount} frijoles.`,
    );
  } catch (error) {
    console.warn(
      `[VoiceRewards] No se pudo enviar el resumen a ${userId}:`,
      error,
    );
  }
}

/**
 * Procesa las misiones semanales de voz.
 *
 * mission.objective representa una cantidad de horas.
 * El progreso se guarda en segundos.
 */
async function processVoiceMissions(
  client: Client,
  guildId: string,
  userId: string,
  elapsedSeconds: number,
): Promise<void> {
  if (elapsedSeconds <= 0) return;

  const activeMissions = await db
    .select()
    .from(missions)
    .where(
      and(
        eq(missions.guildId, guildId),
        eq(missions.weekKey, getWeekKey()),
        eq(missions.active, true),
      ),
    );

  for (const mission of activeMissions) {
    if (mission.action.toLowerCase() !== "voz") {
      continue;
    }

    const [existing] = await db
      .select()
      .from(missionProgress)
      .where(
        and(
          eq(missionProgress.missionId, mission.id),
          eq(missionProgress.guildId, guildId),
          eq(missionProgress.userId, userId),
        ),
      )
      .limit(1);

    const targetSeconds = mission.objective * 60 * 60;
    let progress = existing;

    if (!progress) {
      const total = elapsedSeconds;
      const completed = total >= targetSeconds;
      const now = new Date();

      const [created] = await db
        .insert(missionProgress)
        .values({
          missionId: mission.id,
          guildId,
          userId,
          progressSeconds: total,
          completed,
          paid: false,
          completedAt: completed ? now : null,
        })
        .returning();

      if (!created) {
        throw new Error(
          `No se pudo crear el progreso de la misión ${mission.id}.`,
        );
      }

      progress = created;
    } else if (!progress.completed) {
      const total = progress.progressSeconds + elapsedSeconds;
      const completed = total >= targetSeconds;
      const now = new Date();

      const [updated] = await db
        .update(missionProgress)
        .set({
          progressSeconds: total,
          completed,
          completedAt: completed ? now : null,
        })
        .where(
          and(
            eq(missionProgress.id, progress.id),
            eq(missionProgress.completed, false),
          ),
        )
        .returning();

      if (updated) {
        progress = updated;
      } else {
        const [latest] = await db
          .select()
          .from(missionProgress)
          .where(eq(missionProgress.id, progress.id))
          .limit(1);

        if (!latest) continue;

        progress = latest;
      }
    }

    if (!progress.completed || progress.paid) {
      continue;
    }

    try {
      await unb.editUserBalance(guildId, userId, {
        bank: mission.reward,
      });

      const [paidProgress] = await db
        .update(missionProgress)
        .set({
          paid: true,
          paidAt: new Date(),
        })
        .where(
          and(
            eq(missionProgress.id, progress.id),
            eq(missionProgress.paid, false),
            eq(missionProgress.completed, true),
          ),
        )
        .returning({ id: missionProgress.id });

      if (!paidProgress) {
        console.error(
          `[Missions] La recompensa de "${mission.title}" se envió al banco, ` +
          `pero no se pudo confirmar el pago para ${userId}.`,
        );
        continue;
      }

      console.log(
        `[Missions] ${userId} completó "${mission.title}" ` +
        `y recibió ${mission.reward} frijoles.`,
      );

      try {
        const user = await client.users.fetch(userId);

        await user.send(
          `🎉 ¡Completaste la misión **${mission.title}** ` +
          `y recibiste **${mission.reward.toLocaleString("es-AR")} frijoles**!`,
        );
      } catch (error) {
        console.warn(
          `[Missions] No se pudo notificar a ${userId}:`,
          error,
        );
      }
    } catch (error) {
      console.error(
        `[Missions] Error procesando el pago de "${mission.title}" ` +
        `para ${userId}:`,
        error,
      );
    }
  }
}

/**
 * Acumula tiempo válido y actualiza las misiones.
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
  let elapsedSeconds = 0;

  if (record.sessionStartedAt !== null) {
    elapsedSeconds = Math.max(
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

  // Las misiones utilizan el mismo tiempo válido de voz.
  try {
    await processVoiceMissions(
      client,
      guildId,
      userId,
      elapsedSeconds,
    );
  } catch (error) {
    console.error(
      `[Missions] Error actualizando las misiones de ${userId}:`,
      error,
    );
  }

  // Pagar las horas completas sin enviar DMs individuales.
  await payPendingRewards(client, guildId, userId);
}

/**
 * Paga todas las horas completas pendientes.
 *
 * No envía mensajes privados.
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
        pendingRewardHours: record.pendingRewardHours + 1,
pendingRewardAmount:
  Number(record.pendingRewardAmount ?? 0) + REWARD_AMOUNT,
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
      `[VoiceRewards] ${userId} recibió ${REWARD_AMOUNT} en el banco. ` +
      `Recompensas pendientes de resumen: ${record.pendingRewardHours + 1}.`,
    );
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

    // Sale de un VC autorizado o se desconecta.
    if (wasAllowed && !isAllowed) {
      await accrueTime(client, guildId, userId, false);

      // Un único resumen al salir de todos los VC autorizados.
      await notifyVoiceReward(client, guildId, userId);

      console.log(
        `[VoiceRewards] ${userId} salió de los VC autorizados en ${guildId}.`,
      );

      return;
    }

    // Entra a un VC autorizado.
    if (!wasAllowed && isAllowed) {
      await ensureSession(guildId, userId);
      await payPendingRewards(client, guildId, userId);

      console.log(
        `[VoiceRewards] ${userId} entró a un VC autorizado en ${guildId}.`,
      );

      return;
    }

    // Cambio entre dos VC autorizados: continúa la sesión.
    if (wasAllowed && isAllowed) {
      console.log(
        `[VoiceRewards] ${userId} cambió entre VC autorizados en ${guildId}.`,
      );
    }
  });
}

/**
 * Comprueba periódicamente el tiempo de los usuarios.
 */
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
 * Recupera las sesiones después de un reinicio.
 *
 * No cuenta todo el tiempo que Render estuvo apagado.
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
          let recoveredElapsedSeconds = 0;

          if (record.sessionStartedAt !== null) {
            const elapsed = Math.max(
              0,
              Math.floor(
                (now.getTime() -
                  record.sessionStartedAt.getTime()) / 1000,
              ),
            );

            recoveredElapsedSeconds = Math.min(
              elapsed,
              CHECK_INTERVAL_MS / 1000,
            );

            recoveredSeconds += recoveredElapsedSeconds;
          }

          await db
            .update(voiceRewardsTable)
            .set({
              accumulatedSeconds: recoveredSeconds,
              sessionStartedAt: allowed ? now : null,
              updatedAt: now,
            })
            .where(eq(voiceRewardsTable.id, record.id));

          if (allowed && recoveredElapsedSeconds > 0) {
            try {
              await processVoiceMissions(
                client,
                guild.id,
                state.id,
                recoveredElapsedSeconds,
              );
            } catch (error) {
              console.error(
                `[Missions] Error recuperando progreso de ${state.id}:`,
                error,
              );
            }
          }

          await payPendingRewards(client, guild.id, state.id);
        },
      );
    }
  }
}

/**
 * Inicializa el sistema de recompensas de voz.
 */
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
