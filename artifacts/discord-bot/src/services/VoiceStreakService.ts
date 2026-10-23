
import {
  ChannelType,
  EmbedBuilder,
  Events,
  type Client,
  type Message,
  type TextChannel,
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

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────

const REQUIRED_PRESENT_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 5_000;
const LEADERBOARD_REFRESH_INTERVAL_MS = 60_000;

const MAX_GAP_MS = 48 * 60 * 60 * 1000;
const REWARD_AMOUNT = 100_000;
const TIME_ZONE = "America/Cuiaba";

const TARGET_GUILD_ID = "1437644356977823884";
const TOP_STREAK_ROLE_ID = "1562944386935947284";
const LEADERBOARD_CHANNEL_ID = "1562995350787072020";

const LEADERBOARD_TITLE = "🔥 Leaderboard | Top Rachas";

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

// ─────────────────────────────────────────────────────────────
// ESTADO
// ─────────────────────────────────────────────────────────────

const presenceStartedAt = new Map<string, number>();
const completedUsers = new Set<string>();
const processingUsers = new Set<string>();
const roleSyncInProgress = new Set<string>();

let leaderboardMessage: Message | null = null;
let leaderboardQueue: Promise<void> = Promise.resolve();
let initialized = false;

// ─────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────

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

function formatDays(amount: number): string {
  return `${amount} ${amount === 1 ? "día" : "días"}`;
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

// ─────────────────────────────────────────────────────────────
// REGISTRO DE ASISTENCIA
// ─────────────────────────────────────────────────────────────

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

        if (existing) cycleNumber += 1;
      }
    } else if (existing?.lastAttendanceDate) {
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

// ─────────────────────────────────────────────────────────────
// SINCRONIZACIÓN DEL TOP 10
// ─────────────────────────────────────────────────────────────

async function syncTop10Roles(
  client: Client,
  guildId: string,
): Promise<void> {
  if (guildId !== TARGET_GUILD_ID) return;
  if (roleSyncInProgress.has(guildId)) return;

  roleSyncInProgress.add(guildId);

  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const role = await guild.roles.fetch(TOP_STREAK_ROLE_ID);

    if (!role) {
      console.error(
        `[VoiceStreaks] No se encontró el rol ${TOP_STREAK_ROLE_ID}.`,
      );
      return;
    }

    const now = Date.now();
    const cutoff = new Date(now - MAX_GAP_MS);

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

      try {
        if (shouldHaveRole && !hasRole) {
          await member.roles.add(
            role.id,
            "Ingreso al Top 10 de rachas",
          );
        } else if (!shouldHaveRole && hasRole) {
          await member.roles.remove(
            role.id,
            "Salida del Top 10 o expiración de la racha",
          );
        }
      } catch (error) {
        console.error(
          `[VoiceStreaks] No se pudo sincronizar el rol de ${userId}:`,
          error,
        );
      }
    }

    console.log(
      `[VoiceStreaks] Top 10 sincronizado. Usuarios elegibles: ${top10Ids.size}.`,
    );
  } catch (error) {
    console.error(
      "[VoiceStreaks] Error sincronizando roles:",
      error,
    );
  } finally {
    roleSyncInProgress.delete(guildId);
  }
}

// ─────────────────────────────────────────────────────────────
// BÚSQUEDA DEL MENSAJE DEL LEADERBOARD
// ─────────────────────────────────────────────────────────────

async function findLeaderboardMessage(
  client: Client,
  channel: TextChannel,
): Promise<Message | null> {
  if (leaderboardMessage) {
    try {
      leaderboardMessage = await channel.messages.fetch(
        leaderboardMessage.id,
      );

      return leaderboardMessage;
    } catch {
      leaderboardMessage = null;
    }
  }

  let before: string | undefined;

  while (true) {
    const messages = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });

    if (messages.size === 0) break;

    const existing = messages.find(
      (message) =>
        message.author.id === client.user?.id &&
        message.embeds.some(
          (embed) =>
            embed.title === LEADERBOARD_TITLE ||
            embed.title === "🔥 Leaderboard — Top Rachas de Among Us",
        ),
    );

    if (existing) {
      leaderboardMessage = existing;
      return existing;
    }

    const oldestMessage = messages.last();

    if (!oldestMessage || messages.size < 100) break;

    before = oldestMessage.id;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// RENDERIZADO DEL LEADERBOARD
// ─────────────────────────────────────────────────────────────

async function renderLeaderboard(
  client: Client,
  guildId: string,
): Promise<void> {
  if (guildId !== TARGET_GUILD_ID) return;

  let channel;

  try {
    channel = await client.channels.fetch(LEADERBOARD_CHANNEL_ID);
  } catch (error) {
    console.error(
      "[VoiceStreaks] Error obteniendo el canal del leaderboard:",
      error,
    );
    return;
  }

  if (
    !channel ||
    (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement
    )
  ) {
    console.error(
      "[VoiceStreaks] El canal no existe o no es un canal de texto/anuncios.",
    );
    return;
  }

  const textChannel = channel as TextChannel;
  const now = Date.now();
  const today = getLocalDate(new Date());

  const [streakRows, todayAttendances] = await Promise.all([
    db
      .select()
      .from(voiceStreaksTable)
      .where(eq(voiceStreaksTable.guildId, guildId)),

    db
      .select()
      .from(voiceStreakHistoryTable)
      .where(
        and(
          eq(voiceStreakHistoryTable.guildId, guildId),
          eq(voiceStreakHistoryTable.attendanceDate, today),
        ),
      ),
  ]);

  const activeRows = streakRows
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

  const top10 = activeRows.slice(0, 10);
  const champion = top10[0];

  const absoluteRecord = streakRows.reduce(
    (best, row) => Math.max(best, row.bestStreak ?? 0),
    0,
  );

  const championValue = champion
    ? [
        `👑 <@${champion.userId}>`,
        "",
        `🔥 Racha actual: **${formatDays(champion.currentStreak)}**`,
        `🏆 Récord personal: **${formatDays(champion.bestStreak)}**`,
      ].join("\n")
    : "Todavía no hay rachas activas.";

  const rankingValue = top10.length
    ? top10
        .map((row, index) => {
          const medal =
            index === 0
              ? "🥇"
              : index === 1
                ? "🥈"
                : index === 2
                  ? "🥉"
                  : `**${index + 1}.**`;

          return [
            `${medal} <@${row.userId}>`,
            `└ 🔥 ${formatDays(row.currentStreak)} · 🏆 Récord: ${formatDays(row.bestStreak)}`,
          ].join("\n");
        })
        .join("\n\n")
    : "Todavía no hay usuarios clasificados.";

  const embed = new EmbedBuilder()
    .setColor(0xff7a1a)
    .setTitle(LEADERBOARD_TITLE)
    .setDescription(
      [
        "**AMONG US · TEMPORADA PERMANENTE**",
        "",
        "Las rachas se construyen con constancia.",
        "¿Quién llegará más lejos?",
      ].join("\n"),
    )
    .addFields(
      {
        name: "👑 CAMPEÓN ACTUAL",
        value: championValue,
        inline: false,
      },
      {
        name: "🏅 CLASIFICACIÓN · TOP 10",
        value: rankingValue,
        inline: false,
      },
      {
        name: "🔥 Rachas activas",
        value: `**${activeRows.length}** usuarios`,
        inline: true,
      },
      {
        name: "📅 Asistencias hoy",
        value: `**${todayAttendances.length}**`,
        inline: true,
      },
      {
        name: "🏆 Récord absoluto",
        value: `**${formatDays(absoluteRecord)}**`,
        inline: true,
      },
    )
    .setFooter({
      text: "Actualización automática · ¡Seguí sumando días!",
    })
    .setTimestamp(new Date());

  try {
    const existingMessage = await findLeaderboardMessage(
      client,
      textChannel,
    );

    if (existingMessage) {
      leaderboardMessage = await existingMessage.edit({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });

      console.log(
        `[VoiceStreaks] Leaderboard actualizado: ${leaderboardMessage.id}`,
      );
    } else {
      leaderboardMessage = await textChannel.send({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });

      console.log(
        `[VoiceStreaks] Leaderboard publicado: ${leaderboardMessage.id}`,
      );
    }
  } catch (error) {
    console.error(
      "[VoiceStreaks] Error publicando o editando el leaderboard:",
      error,
    );
  }
}

export function renderVoiceStreakLeaderboard(
  client: Client,
  guildId: string = TARGET_GUILD_ID,
): Promise<void> {
  leaderboardQueue = leaderboardQueue
    .then(() => renderLeaderboard(client, guildId))
    .catch((error) => {
      console.error(
        "[VoiceStreaks] Error actualizando el leaderboard:",
        error,
      );
    });

  return leaderboardQueue;
}

// ─────────────────────────────────────────────────────────────
// RECOMPENSAS
// ─────────────────────────────────────────────────────────────

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
      `[VoiceStreaks] Recompensa de ${REWARD_AMOUNT} pagada a ${userId}. Hito: ${milestone}, ciclo: ${cycleNumber}.`,
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

// ─────────────────────────────────────────────────────────────
// PROCESAMIENTO DE ASISTENCIA
// ─────────────────────────────────────────────────────────────

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

    await syncTop10Roles(client, guildId);
    await renderVoiceStreakLeaderboard(client, guildId);

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

// ─────────────────────────────────────────────────────────────
// SEGUIMIENTO DE VOZ
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────

export function setupVoiceStreaks(client: Client): void {
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    handleVoiceUpdate(client, oldState, newState);
  });

  const initialize = (): void => {
    if (initialized) return;
    initialized = true;

    for (const guild of client.guilds.cache.values()) {
      checkPresence(client, guild.id);
    }

    void syncTop10Roles(client, TARGET_GUILD_ID);
    void renderVoiceStreakLeaderboard(client, TARGET_GUILD_ID);

    setInterval(() => {
      for (const guild of client.guilds.cache.values()) {
        checkPresence(client, guild.id);
      }

      void syncTop10Roles(client, TARGET_GUILD_ID);
    }, CHECK_INTERVAL_MS);

    setInterval(() => {
      void renderVoiceStreakLeaderboard(client, TARGET_GUILD_ID);
    }, LEADERBOARD_REFRESH_INTERVAL_MS);

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
