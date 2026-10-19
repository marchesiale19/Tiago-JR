
import {
  Events,
  type Client,
  type VoiceState,
} from "discord.js";
import { and, eq } from "drizzle-orm";

import { db } from "@workspace/db";
import { voiceRewardsTable } from "@workspace/db/schema";
import { unb } from "../lib/unbelievaboat";

const REWARD_SECONDS = 3600;
const REWARD_AMOUNT = 50_000;
const CHECK_INTERVAL_MS = 60_000;

const processingUsers = new Set<string>();

function getKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

async function ensureSession(
  guildId: string,
  userId: string,
): Promise<void> {
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

  const now = new Date();
  const record = rows[0];

  if (record) {
    // Una sesión nueva comienza ahora; no contamos el tiempo
    // durante el que el bot pudo haber estado desconectado.
    await db
      .update(voiceRewardsTable)
      .set({ sessionStartedAt: now, updatedAt: now })
      .where(eq(voiceRewardsTable.id, record.id));
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

async function stopSession(
  guildId: string,
  userId: string,
): Promise<void> {
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

  const record = rows[0];
  if (!record?.sessionStartedAt) return;

  const now = new Date();
  const elapsed = Math.max(
    0,
    Math.floor(
      (now.getTime() - record.sessionStartedAt.getTime()) / 1000,
    ),
  );

  const total = record.accumulatedSeconds + elapsed;
  const rewards = Math.floor(total / REWARD_SECONDS);
  const remaining = total % REWARD_SECONDS;

  // Guardamos el progreso antes de llamar a la API.
  await db
    .update(voiceRewardsTable)
    .set({
      accumulatedSeconds: remaining,
      sessionStartedAt: null,
      updatedAt: now,
    })
    .where(eq(voiceRewardsTable.id, record.id));

  for (let i = 0; i < rewards; i++) {
    await unb.editUserBalance(guildId, userId, {
      bank: REWARD_AMOUNT,
    });
  }

  console.log(
    `[VoiceRewards] ${userId} salió. Recompensas: ${rewards}.`,
  );
}

async function checkUser(
  client: Client,
  guildId: string,
  userId: string,
): Promise<void> {
  const key = getKey(guildId, userId);
  if (processingUsers.has(key)) return;

  processingUsers.add(key);

  try {
    const guild = client.guilds.cache.get(guildId);
    const voiceState = guild?.voiceStates.cache.get(userId);

    if (!guild || !voiceState?.channelId) return;

    const member = voiceState.member;
    if (member?.user.bot) return;

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

    const record = rows[0];
    if (!record?.sessionStartedAt) {
      await ensureSession(guildId, userId);
      return;
    }

    const now = new Date();
    const elapsed = Math.max(
      0,
      Math.floor(
        (now.getTime() - record.sessionStartedAt.getTime()) / 1000,
      ),
    );

    const total = record.accumulatedSeconds + elapsed;
    const rewards = Math.floor(total / REWARD_SECONDS);

    if (rewards === 0) return;

    const remaining = total % REWARD_SECONDS;

    // Se conserva el excedente para la siguiente hora.
    // El avance de la sesión se guarda antes del pago para
    // reducir el riesgo de duplicar una recompensa tras reiniciar.
    await db
      .update(voiceRewardsTable)
      .set({
        accumulatedSeconds: remaining,
        sessionStartedAt: now,
        updatedAt: now,
      })
      .where(eq(voiceRewardsTable.id, record.id));

    for (let i = 0; i < rewards; i++) {
      await unb.editUserBalance(guildId, userId, {
        bank: REWARD_AMOUNT,
      });
    }

    console.log(
      `[VoiceRewards] ${userId}: ${rewards} recompensa(s) acreditada(s).`,
    );
  } catch (error) {
    console.error(`[VoiceRewards] Error con ${userId}:`, error);
  } finally {
    processingUsers.delete(key);
  }
}

async function handleVoiceUpdate(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  if (newState.member?.user.bot) return;

  const guildId = newState.guild.id;
  const userId = newState.id;

  if (oldState.channelId === newState.channelId) return;

  if (!oldState.channelId && newState.channelId) {
    await ensureSession(guildId, userId);
    return;
  }

  if (oldState.channelId && !newState.channelId) {
    await stopSession(guildId, userId);
    return;
  }

  // Cambiar de canal no reinicia la sesión.
}

export function setupVoiceRewards(client: Client): void {
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    void handleVoiceUpdate(oldState, newState).catch((error) => {
      console.error("[VoiceRewards] Error procesando estado de voz:", error);
    });
  });

  client.once(Events.ClientReady, (readyClient) => {
    // Recuperamos a quienes ya están en voz al iniciar el bot.
    for (const guild of readyClient.guilds.cache.values()) {
      for (const state of guild.voiceStates.cache.values()) {
        if (!state.channelId || state.member?.user.bot) continue;

        void ensureSession(guild.id, state.id).catch((error) => {
          console.error("[VoiceRewards] Error recuperando sesión:", error);
        });
      }
    }

    setInterval(() => {
      for (const guild of readyClient.guilds.cache.values()) {
        for (const state of guild.voiceStates.cache.values()) {
          if (!state.channelId || state.member?.user.bot) continue;
          void checkUser(readyClient, guild.id, state.id);
        }
      }
    }, CHECK_INTERVAL_MS);
  });
}
