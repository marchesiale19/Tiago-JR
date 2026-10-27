
import { and, eq } from "drizzle-orm";
import {
  EmbedBuilder,
  type GuildMember,
  type VoiceState,
} from "discord.js";

import { db } from "../../database";
import {
  missions,
  missionProgress,
} from "../../database/schema/missions";

import { getWeekKey } from "./mission.service";

// Reemplazá esta importación por la instancia existente en Tiago-JR.
import { unb } from "../../lib/unbelievaboat";

export function isEligibleVoiceState(state: VoiceState): boolean {
  return Boolean(
    state.channelId &&
    state.channelId !== "1478566817579667600" &&
    !state.selfMute &&
    !state.serverMute &&
    !state.selfDeaf &&
    !state.serverDeaf
  );
}

function formatBeans(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

async function ensureProgress(
  missionId: number,
  guildId: string,
  userId: string,
) {
  await db
    .insert(missionProgress)
    .values({ missionId, guildId, userId })
    .onConflictDoNothing();
}

async function payCompletedMission(
  member: GuildMember,
  mission: typeof missions.$inferSelect,
  progressId: number,
) {
  const [progress] = await db
    .select()
    .from(missionProgress)
    .where(eq(missionProgress.id, progressId))
    .limit(1);

  if (!progress || progress.paid || !progress.completed) return;

  /*
   * IMPORTANTE:
   * Confirmá la firma de editUserBalance con la versión del
   * cliente UnbelievaBoat que ya está instalada en el proyecto.
   * Este ejemplo usa la forma guildId, userId, amount, "bank".
   */
  await unb.editUserBalance(
    member.guild.id,
    member.id,
    mission.reward,
    "bank",
  );

  await db
    .update(missionProgress)
    .set({ paid: true, paidAt: new Date() })
    .where(eq(missionProgress.id, progressId));

  try {
    await member.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(
            [
              `**Completaste la misión #${mission.id}**`,
              mission.title,
              `Se depositaron \`${formatBeans(mission.reward)}\` a tu balance de UnbelievaBoat.`,
            ].join("\n"),
          ),
      ],
    });
  } catch {
    // El usuario puede tener los MD cerrados.
    // La recompensa no debe retirarse por un fallo de notificación.
  }
}

/**
 * Cierra el intervalo válido anterior, guarda los segundos y
 * comienza un nuevo intervalo si el estado actual es elegible.
 *
 * Llamar desde voiceStateUpdate y desde el proceso periódico.
 */
export async function updateMemberVoiceProgress(
  member: GuildMember,
  eligible: boolean,
) {
  const now = new Date();

  const activeMissions = await db
    .select()
    .from(missions)
    .where(
      and(
        eq(missions.guildId, member.guild.id),
        eq(missions.weekKey, getWeekKey(now)),
        eq(missions.active, true),
        eq(missions.action, "Voz"),
      ),
    );

  for (const mission of activeMissions) {
    await ensureProgress(mission.id, member.guild.id, member.id);

    const [progress] = await db
      .select()
      .from(missionProgress)
      .where(
        and(
          eq(missionProgress.missionId, mission.id),
          eq(missionProgress.guildId, member.guild.id),
          eq(missionProgress.userId, member.id),
        ),
      )
      .limit(1);

    if (!progress || progress.completed) continue;

    // Solo se suman intervalos previamente iniciados.
    const elapsedSeconds = progress.sessionStartedAt
      ? Math.max(
          0,
          Math.floor(
            (now.getTime() - progress.sessionStartedAt.getTime()) / 1000,
          ),
        )
      : 0;

    const totalSeconds = progress.progressSeconds + elapsedSeconds;
    const targetSeconds = mission.objective * 3600;
    const completed = totalSeconds >= targetSeconds;

    await db
      .update(missionProgress)
      .set({
        progressSeconds: totalSeconds,
        sessionStartedAt: eligible && !completed ? now : null,
        completed,
        completedAt: completed ? now : null,
      })
      .where(eq(missionProgress.id, progress.id));

    if (completed) {
      await payCompletedMission(member, mission, progress.id);
    }
  }
}
