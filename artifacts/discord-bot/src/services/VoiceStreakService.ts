
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

const LEADERBOARD_TITLE =
  "🔥 Leaderboard — Top Rachas de Among Us";

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
// ESTADO EN MEMORIA
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
  return (
    channelId !== null &&
    ALLOWED_VOICE_CHANNEL_IDS.has(channelId)
  );
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

function getEligibleUsers(
  client: Client,
  guildId: string,
): Set<string> {
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
// REGISTRO DE ASISTENCIAS
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

    // Una sola asistencia por usuario y fecha local.
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
      milestone:
        currentStreak % 10 === 0 ? currentStreak : null,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// ROL AUTOMÁTICO DEL TOP 10
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

    // Expirar rachas inactivas sin borrar sus récords.
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

    // Miembros que ya tienen el rol y nuevos integrantes del Top 10.
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
            "Ingreso al Top 10 de rachas de voz",
          );

          console.log(
            `[VoiceStreaks] Rol del Top 10 asignado a ${userId}.`,
          );
        } else if (!shouldHaveRole && hasRole) {
          await member.roles.remove(
            role.id,
            "Salida del Top 10 o expiración de la racha",
          );

          console.log(
            `[VoiceStreaks] Rol del Top 10 retirado a ${userId}.`,
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
// LEADERBOARD DECORADO
// ─────────────────────────────────────────────────────────────

async function findLeaderboardMessage(
  client: Client,
  channel: TextChannel,
): Promise<Message | null> {
  // Reutilizar el mensaje encontrado durante esta ejecución.
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

  // Buscar el embed anterior después de reiniciar el bot.
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
          (embed) => embed.title === LEADERBOARD_TITLE,
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

async function renderLeaderboard(
  client: Client,
  guildId: string,
): Promise<void> {
  if (guildId !== TARGET_GUILD_ID) return;

  const channel = await client.channels.fetch(
    LEADERBOARD_CHANNEL_ID,
  );

  if (!channel || channel.type !== ChannelType.GuildText) {
    console.error(
      "[VoiceStreaks] El canal del leaderboard no existe o no es de texto.",
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

  // Solo mostrar rachas positivas que no hayan vencido.
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
    (record, row) =>
      Math.max(record, row.bestStreak ?? 0),
    0,
  );

  // Campeón destacado.
  const championValue = champion
    ? [
        `> <@${champion.userId}>`,
        "",
        `> 🔥 **${champion.currentStreak} días consecutivos**`,
        `> 🏆 Récord personal: **${champion.bestStreak} días**`,
        "",
        "━━━━━━━━━━━━━━━━━━━━━━",
        "👑 **Dominando el leaderboard**",
      ].join("\n")
    : "Todavía no hay una racha activa para coronar al campeón.";

  // Medallas para el podio y numeración para el resto.
  const rankingLines = top10.map((row, index) => {
    const position = index + 1;

    const medal =
      position === 1
        ? "🥇"
        : position === 2
          ? "🥈"
          : position === 3
            ? "🥉"
            : `**${position}.**`;

    return [
      `${medal} <@${row.userId}>`,
      `└ 🔥 **${row.currentStreak} días** · 🏆 Récord: **${row.bestStreak} días**`,
    ].join("\n");
  });

  const rankingValue =
    rankingLines.length > 0
      ? rankingLines.join("\n\n")
      : "No hay usuarios clasificados todavía.";

  const embed = new EmbedBuilder()
    .setColor(0xff7a1a)
    .setTitle(LEADERBOARD_TITLE)
    .setDescription(
      [
        "```ansi",
        "\u001b[1;33m      AMONG US · TEMPORADA PERMANENTE\u001b[0m",
        "```",
        "╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮",
        "　🏅 **LOS MÁS CONSTANTES DEL SERVIDOR**",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
        "",
        "Cada asistencia cuenta. ¿Quién dominará la clasificación?",
      ].join("\n"),
    )
    .addFields(
      {
        name: "👑 REY DE LAS RACHAS",
        value: championValue,
        inline: false,
      },
      {
        name: "🏅 CLASIFICACIÓN GENERAL",
        value: rankingValue,
        inline: false,
      },
      {
        name: "🔥 RACHAS ACTIVAS",
        value: `**${activeRows.length}**\nUsuarios con racha vigente`,
        inline: true,
      },
      {
        name: "📅 ASISTENCIAS HOY",
        value: `**${todayAttendances.length}**\nAsistencias registradas`,
        inline: true,
      },
      {
        name: "🏆 RÉCORD ABSOLUTO",
        value: `**${absoluteRecord} días**\nMejor racha histórica`,
        inline: true,
      },
    )
    .setFooter({
      text:
        `⚡ Actualización automática • Rachas activas: ${activeRows.length}` +
        ` • Asistencias hoy: ${todayAttendances.length}` +
        ` • Récord absoluto: ${absoluteRecord} días`,
    })
    .setTimestamp(new Date());

  const existingMessage = await findLeaderboardMessage(
    client,
    textChannel,
  );

  if (existingMessage) {
    await existingMessage.edit({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  } else {
    leaderboardMessage = await textChannel.send({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });

    console.log(
      `[VoiceStreaks] Leaderboard publicado. Mensaje: ${leaderboardMessage.id}`,
    );
  }

  console.log("[VoiceStreaks] Leaderboard actualizado.");
}

/**
 * Serializa las actualizaciones para evitar que dos eventos
 * editen simultáneamente el mismo mensaje.
 */
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
// PRESENCIA EN VOZ
// ─────────────────────────────────────────────────────────────

function checkPresence(
  client: Client,
  guildId: string,
): void {
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

    // Sincronizar roles y publicar/editar el embed al iniciar.
    void syncTop10Roles(client, TARGET_GUILD_ID);
    void renderVoiceStreakLeaderboard(client, TARGET_GUILD_ID);

    // Revisar presencia y expiración de rachas.
    setInterval(() => {
      for (const guild of client.guilds.cache.values()) {
        checkPresence(client, guild.id);
      }

      void syncTop10Roles(client, TARGET_GUILD_ID);
    }, CHECK_INTERVAL_MS);

    // Actualizar estadísticas y ranking cada minuto.
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
