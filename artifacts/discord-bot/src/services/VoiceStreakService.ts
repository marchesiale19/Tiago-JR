
import {
  Events,
  type Client,
  type VoiceState,
} from "discord.js";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import {
  db,
  voiceStreaksTable,
  voiceStreakHistoryTable,
  voiceStreakRewardsTable,
} from "@workspace/db";
import { unb } from "../lib/unbelievaboat";

const REQUIRED_PRESENT_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 5_000;
const ROLE_SYNC_INTERVAL_MS = 60 * 1000;
const MAX_GAP_MS = 48 * 60 * 60 * 1000;
const REWARD_AMOUNT = 100_000;
const TIME_ZONE = "America/Cuiaba";

const TARGET_GUILD_ID = "1437644356977823884";
const TOP_STREAK_ROLE_ID = "1562944386935947284";

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
const processingUsers = new Set<string>();
const roleSyncInProgress = new Set<string>();

function getUserKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function isAllowed(channelId: string | null): boolean {
  return channelId !== null && ALLOWED_VOICE_CHANNEL_IDS.has(channelId);
}

function getLocalDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function getEligibleUsers(client: Client, guildId: string): Set<string> {
  const guild = client.guilds.cache.get(guildId);
  const users = new Set<string>();

  if (!guild) return users;

  for (const state of guild.voiceStates.cache.values()) {
    if (!state.member || state.member.user.bot) continue;
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

type AttendanceResult = {
  currentStreak: number;
  bestStreak: number;
  cycleNumber: number;
  milestone: number | null;
};

async function recordAttendance(
  guildId: string,
  userId: string,
): Promise<AttendanceResult | null> {
  const now = new Date();
  const today = getLocalDate(now);

  return db.transaction(async (tx) => {
    const [latestAttendance] = await tx
      .select()
      .from(voiceStreakHistoryTable)
      .where(
        and(
          eq(voiceStreakHistoryTable.guildId, guildId),
          eq(voiceStreakHistoryTable.userId, userId),
        ),
      )
      .orderBy(desc(voiceStreakHistoryTable.attendanceDate))
      .limit(1);

    const [insertedAttendance] = await tx
      .insert(voiceStreakHistoryTable)
      .values({
        guildId,
        userId,
        attendanceDate: today,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: voiceStreakHistoryTable.id });

    // Solo se registra una asistencia por usuario y fecha local.
    if (!insertedAttendance) return null;

    const [existing] = await tx
      .select()
      .from(voiceStreaksTable)
      .where(
        and(
          eq(voiceStreaksTable.guildId, guildId),
          eq(voiceStreaksTable.userId, userId),
        ),
      )
      .limit(1);

    let currentStreak = 1;
    let cycleNumber = existing?.cycleNumber ?? 1;

    if (latestAttendance) {
      const elapsed =
        now.getTime() - latestAttendance.createdAt.getTime();

      if (elapsed <= MAX_GAP_MS) {
        currentStreak = (existing?.currentStreak ?? 0) + 1;
      } else {
        currentStreak = 1;

        if (existing) {
          cycleNumber += 1;
        }
      }
    } else if (existing?.lastAttendanceDate) {
      // Recuperación ante un historial previo incompleto.
      cycleNumber += 1;
    }

    const bestStreak = Math.max(
      existing?.bestStreak ?? 0,
      currentStreak,
    );

    if (existing) {
      await tx
        .update(voiceStreaksTable)
        .set({
          currentStreak,
          bestStreak,
          cycleNumber,
          lastAttendanceDate: today,
          updatedAt: now,
        })
        .where(eq(voiceStreaksTable.id, existing.id));
    } else {
      await tx.insert(voiceStreaksTable).values({
        guildId,
        userId,
        currentStreak,
        bestStreak,
        cycleNumber,
        lastAttendanceDate: today,
        updatedAt: now,
      });
    }

    return {
      currentStreak,
      bestStreak,
      cycleNumber,
      milestone: currentStreak % 10 === 0 ? currentStreak : null,
    };
  });
}

/**
 * Expira rachas inactivas y sincroniza el rol con el Top 10.
 * El récord histórico se conserva aunque la racha actual expire.
 */
async function syncTop10Roles(client: Client, guildId: string): Promise<void> {
  if (guildId !== TARGET_GUILD_ID) return;
  if (roleSyncInProgress.has(guildId)) return;

  roleSyncInProgress.add(guildId);

  try {
    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
      console.error(
        "[VoiceStreaks] No se encontró el servidor para sincronizar roles.",
      );
      return;
    }

    const role = await guild.roles.fetch(TOP_STREAK_ROLE_ID);

    if (!role) {
      console.error(
        `[VoiceStreaks] No se encontró el rol ${TOP_STREAK_ROLE_ID}.`,
      );
      return;
    }

    const now = Date.now();
    const cutoff = new Date(now - MAX_GAP_MS);

    // Las rachas que superan las 48 horas de inactividad expiran.
    // No se modifica updatedAt para conservar la referencia de actividad.
    await db
      .update(voiceStreaksTable)
      .set({ currentStreak: 0 })
      .where(
        and(
          eq(voiceStreaksTable.guildId, guildId),
          gt(voiceStreaksTable.currentStreak, 0),
          lt(voiceStreaksTable.updatedAt, cutoff),
        ),
      );

    const rows = await db
      .select()
      .from(voiceStreaksTable)
      .where(eq(voiceStreaksTable.guildId, guildId));

    const activeRows = rows
      .filter(
        (row) =>
          row.currentStreak > 0 &&
          now - row.updatedAt.getTime() <= MAX_GAP_MS,
      )
      .sort(
        (a, b) =>
          b.currentStreak - a.currentStreak ||
          b.bestStreak - a.bestStreak ||
          a.userId.localeCompare(b.userId),
      );

    const top10Ids = new Set(
      activeRows.slice(0, 10).map((row) => row.userId),
    );

    // Incluye los miembros que ya tienen el rol y los nuevos integrantes
    // del Top 10 que estén registrados en la base de datos.
    const candidateIds = new Set([
      ...role.members.keys(),
      ...top10Ids,
    ]);

    for (const userId of candidateIds) {
      let member = guild.members.cache.get(userId);

      if (!member) {
        try {
          member = await guild.members.fetch(userId);
        } catch (error) {
          console.error(
            `[VoiceStreaks] No se pudo obtener al miembro ${userId}:`,
            error,
          );
          continue;
        }
      }

      const hasRole = member.roles.cache.has(role.id);
      const shouldHaveRole = top10Ids.has(userId);

      if (shouldHaveRole && !hasRole) {
        try {
          await member.roles.add(
            role.id,
            "Ingreso al Top 10 de rachas de voz",
          );

          console.log(
            `[VoiceStreaks] Rol del Top 10 asignado a ${userId}.`,
          );
        } catch (error) {
          console.error(
            `[VoiceStreaks] No se pudo asignar el rol a ${userId}:`,
            error,
          );
        }
      } else if (!shouldHaveRole && hasRole) {
        try {
          await member.roles.remove(
            role.id,
            "Salida del Top 10 o expiración de la racha",
          );

          console.log(
            `[VoiceStreaks] Rol del Top 10 retirado a ${userId}.`,
          );
        } catch (error) {
          console.error(
            `[VoiceStreaks] No se pudo retirar el rol a ${userId}:`,
            error,
          );
        }
      }
    }

    console.log(
      `[VoiceStreaks] Top 10 sincronizado. Usuarios elegibles: ${top10Ids.size}.`,
    );
  } catch (error) {
    console.error(
      "[VoiceStreaks] Error sincronizando el Top 10:",
      error,
    );
  } finally {
    roleSyncInProgress.delete(guildId);
  }
}

async function payMilestoneReward(
  guildId: string,
  userId: string,
  cycleNumber: number,
  milestone: number,
): Promise<void> {
  let rewardId: number;

  try {
    const [claim] = await db
      .insert(voiceStreakRewardsTable)
      .values({
        guildId,
        userId,
        cycleNumber,
        milestone,
        status: "processing",
      })
      .onConflictDoNothing()
      .returning({ id: voiceStreakRewardsTable.id });

    // Evita acreditar dos veces el mismo hito automáticamente.
    if (!claim) return;

    rewardId = claim.id;
  } catch (error) {
    console.error(
      "[VoiceStreaks] No se pudo registrar la recompensa:",
      error,
    );
    return;
  }

  try {
    await unb.editUserBalance(guildId, userId, {
      bank: REWARD_AMOUNT,
    });

    await db
      .update(voiceStreakRewardsTable)
      .set({
        status: "paid",
        paidAt: new Date(),
      })
      .where(eq(voiceStreakRewardsTable.id, rewardId));

    console.log(
      `[VoiceStreaks] Recompensa de ${REWARD_AMOUNT} pagada a ${userId}. Racha: ${milestone}, ciclo: ${cycleNumber}.`,
    );
  } catch (error) {
    try {
      await db
        .update(voiceStreakRewardsTable)
        .set({ status: "failed" })
        .where(eq(voiceStreakRewardsTable.id, rewardId));
    } catch (dbError) {
      console.error(
        "[VoiceStreaks] No se pudo actualizar el estado de la recompensa:",
        dbError,
      );
    }

    console.error(
      `[VoiceStreaks] Falló el pago del hito ${milestone} para ${userId}. Revisar manualmente antes de reintentar.`,
      error,
    );
  }
}

async function processAttendance(
  client: Client,
  guildId: string,
  userId: string,
): Promise<void> {
  const key = getUserKey(guildId, userId);

  if (processingUsers.has(key)) return;
  processingUsers.add(key);

  try {
    const result = await recordAttendance(guildId, userId);

    if (!result) {
      console.log(
        `[VoiceStreaks] ${userId} ya registró asistencia hoy.`,
      );
      return;
    }

    console.log(
      `[VoiceStreaks] Asistencia de ${userId}: racha ${result.currentStreak}, récord ${result.bestStreak}.`,
    );

    // Actualiza los roles después de registrar la asistencia.
    await syncTop10Roles(client, guildId);

    if (result.milestone !== null) {
      await payMilestoneReward(
        guildId,
        userId,
        result.cycleNumber,
        result.milestone,
      );
    }
  } catch (error) {
    completedUsers.delete(key);

    console.error(
      `[VoiceStreaks] Error al registrar asistencia de ${userId}:`,
      error,
    );
  } finally {
    processingUsers.delete(key);
  }
}

function checkPresence(client: Client, guildId: string): void {
  const users = getEligibleUsers(client, guildId);
  const now = Date.now();

  if (users.size < 2) {
    resetGuildPresence(guildId);
    return;
  }

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
      void processAttendance(client, guildId, userId);
    }
  }

  // Limpiar contadores de quienes salieron de los canales autorizados.
  for (const key of presenceStartedAt.keys()) {
    if (!key.startsWith(`${guildId}:`)) continue;

    const userId = key.slice(guildId.length + 1);

    if (!users.has(userId)) {
      presenceStartedAt.delete(key);
    }
  }

  for (const key of completedUsers) {
    if (!key.startsWith(`${guildId}:`)) continue;

    const userId = key.slice(guildId.length + 1);

    if (!users.has(userId)) {
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

    // Sincronización inicial del Top 10.
    void syncTop10Roles(client, TARGET_GUILD_ID);

    // Comprueba periódicamente las rachas vencidas y los cambios del ranking.
    setInterval(() => {
      for (const guild of client.guilds.cache.values()) {
        checkPresence(client, guild.id);
      }

      void syncTop10Roles(client, TARGET_GUILD_ID);
    }, CHECK_INTERVAL_MS);

    console.log(
      `[VoiceStreaks] Seguimiento iniciado. Canales autorizados: ${ALLOWED_VOICE_CHANNEL_IDS.size}.`,
    );
  };

  if (client.isReady()) {
    initialize();
  } else {
    client.once(Events.ClientReady, initialize);
  }
}
