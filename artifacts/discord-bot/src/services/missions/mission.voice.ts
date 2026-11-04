
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
import { unb } from "../../lib/unbelievaboat";

// ÚNICOS canales de voz donde se permite acumular progreso.
const MISSION_VOICE_CHANNEL_IDS = [
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
] as const;

/**
 * Comprueba si el miembro está en un canal autorizado
 * y cumple las condiciones para acumular progreso.
 */
export function isEligibleVoiceState(state: VoiceState): boolean {
  return Boolean(
    state.channelId &&
    MISSION_VOICE_CHANNEL_IDS.includes(
      state.channelId as (typeof MISSION_VOICE_CHANNEL_IDS)[number]
    ) &&
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

 await unb.editUserBalance(
  member.guild.id,
  member.id,
  { bank: mission.reward },
  `Recompensa por completar misión #${mission.id}`,
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
  }
}

/**
 * Actualiza el progreso de voz de un miembro.
 *
 * Solo acumula tiempo cuando eligible es true.
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
