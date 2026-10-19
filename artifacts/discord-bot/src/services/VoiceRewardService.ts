
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

// Evita registrar dos veces el mismo evento para el mismo usuario.
const processingUsers = new Set<string>();

function getKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

async function processVoiceState(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  const guildId = newState.guild.id;
  const userId = newState.id;
  const key = getKey(guildId, userId);

  if (newState.member?.user.bot) return;
  if (oldState.channelId === newState.channelId) return;
  if (processingUsers.has(key)) return;

  processingUsers.add(key);

  try {
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
    const now = new Date();

    // Entrada a voz: comenzar o reanudar la sesión.
    if (!oldState.channelId && newState.channelId) {
      if (record) {
        await db
          .update(voiceRewardsTable)
          .set({
            sessionStartedAt: now,
            updatedAt: now,
          })
          .where(eq(voiceRewardsTable.id, record.id));
      } else {
        await db.insert(voiceRewardsTable).values({
          guildId,
          userId,
          accumulatedSeconds: 0,
          sessionStartedAt: now,
          updatedAt: now,
        });
      }

      console.log(`[VoiceRewards] ${userId} entró a voz.`);
      return;
    }

    // Salida de voz: guardar el tiempo acumulado.
    if (oldState.channelId && !newState.channelId) {
      if (!record?.sessionStartedAt) return;

      const elapsedSeconds = Math.max(
        0,
        Math.floor(
          (now.getTime() - record.sessionStartedAt.getTime()) / 1000,
        ),
      );

      const totalSeconds =
        record.accumulatedSeconds + elapsedSeconds;

      const rewards = Math.floor(totalSeconds / REWARD_SECONDS);
      const remainingSeconds = totalSeconds % REWARD_SECONDS;

      for (let i = 0; i < rewards; i++) {
        await unb.editUserBalance(guildId, userId, {
          bank: REWARD_AMOUNT,
        });
      }

      await db
        .update(voiceRewardsTable)
        .set({
          accumulatedSeconds: remainingSeconds,
          sessionStartedAt: null,
          updatedAt: now,
        })
        .where(eq(voiceRewardsTable.id, record.id));

      console.log(
        `[VoiceRewards] ${userId} salió. Recompensas: ${rewards}.`,
      );
      return;
    }

    // Cambio de canal: mantener la sesión sin reiniciar el contador.
    if (oldState.channelId && newState.channelId) {
      console.log(`[VoiceRewards] ${userId} cambió de canal.`);
    }
  } catch (error) {
    console.error(`[VoiceRewards] Error con ${userId}:`, error);
  } finally {
    processingUsers.delete(key);
  }
}

export function setupVoiceRewards(client: Client): void {
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    void processVoiceState(oldState, newState);
  });
}
