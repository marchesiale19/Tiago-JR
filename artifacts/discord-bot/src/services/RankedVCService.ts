
import {
  Guild,
  ChannelType,
  PermissionFlagsBits,
  type VoiceChannel,
  type OverwriteResolvable,
} from "discord.js";

import { db } from "../database/database";
import { lobbysTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { getConfig } from "./ConfigService";
import { ConfigKey } from "../database/enums";
import { logger } from "../lib/logger";

const RANKED_VC_PREFIX = "「🎙」ranked ";
const MAX_VC_USERS = 15;

const RANKED_ALLOWED_ROLE_IDS = [
  "1539368076326473868", // Developer Tiago Jr
  "1451383215603585140",  // Owner
  "1508266687689003039",  // Co-Owner
  "1512634750152478851",  // Jefe Staff
  "1485101671875874997",  // Administrador Elite
  "1455419124732657801",  // Equipo Administrativo
  "1522434536796061816",  // Desarrollador
  "1453211902267228160",  // Administrador
  "1509760475653472287",  // Administrador [PB]
  "1522807097920720967",  // Manager
] as const;

// Estados considerados activos.
const ACTIVE_STATUSES = [
  "queue",
  "waiting_supervisor",
  "ready",
  "in_game",
  "validating",
] as const;

/**
 * Configura los permisos privados de un VC competitivo.
 *
 * @param guild Servidor de Discord.
 * @param vc Canal de voz competitivo.
 * @param playerIds IDs de los jugadores autorizados.
 * @param supervisorId ID opcional del supervisor.
 */
export async function configureRankedVC(
  guild: Guild,
  vc: VoiceChannel,
  playerIds: string[] = [],
  supervisorId?: string,
): Promise<void> {
  const overwrites: OverwriteResolvable[] = [
    {
      id: guild.id,
      deny: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
      ],
    },
  ];

  // Autorizar los roles administrativos.
  for (const roleId of RANKED_ALLOWED_ROLE_IDS) {
    const role = await guild.roles.fetch(roleId).catch(() => null);

    if (!role) {
      logger.warn(
        { roleId, vcId: vc.id },
        "Ranked VC: authorized role not found",
      );
      continue;
    }

    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  // Garantizar el acceso del bot.
  const botMember = guild.members.me;

  if (botMember) {
    overwrites.push({
      id: botMember.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.MoveMembers,
      ],
    });
  }

  // Autorizar a los jugadores de esta partida.
  for (const playerId of new Set(playerIds)) {
    overwrites.push({
      id: playerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  // Autorizar al supervisor asignado.
  if (supervisorId) {
    overwrites.push({
      id: supervisorId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  await vc.permissionOverwrites.set(
    overwrites,
    "Configurar acceso privado de partida competitiva",
  );

  logger.info(
    {
      vcId: vc.id,
      playerCount: new Set(playerIds).size,
      hasSupervisor: Boolean(supervisorId),
    },
    "Ranked VC permissions configured",
  );
}

/**
 * Encuentra un VC competitivo disponible o crea uno nuevo.
 * Los canales no se eliminan automáticamente.
 */
export async function getOrCreateRankedVC(
  guild: Guild,
): Promise<VoiceChannel> {
  await guild.channels.fetch();

  const rankedVCs = guild.channels.cache
    .filter(
      (ch): ch is VoiceChannel =>
        ch.type === ChannelType.GuildVoice &&
        ch.name.startsWith(RANKED_VC_PREFIX),
    )
    .sort((a, b) => {
      const numA = parseInt(
        a.name.replace(RANKED_VC_PREFIX, ""),
        10,
      );
      const numB = parseInt(
        b.name.replace(RANKED_VC_PREFIX, ""),
        10,
      );

      return numA - numB;
    });

  const busyVcIds = await getActiveRankedVcIds();

  // Reutilizar el primer canal disponible.
  for (const vc of rankedVCs.values()) {
    if (
      !busyVcIds.has(vc.id) &&
      vc.members.size < MAX_VC_USERS
    ) {
      // Lo dejamos privado incluso si ya existía.
      await configureRankedVC(guild, vc);

      logger.info(
        { vcId: vc.id, vcName: vc.name },
        "Reusing existing private Ranked VC",
      );

      return vc;
    }
  }

  // Crear un nuevo canal si no hay ninguno disponible.
  const nextNumber = rankedVCs.size + 1;
  const vcName = `${RANKED_VC_PREFIX}${nextNumber}`;

  const categoryId = await getConfig(
    ConfigKey.RankedVcCategoryId,
  );

  const newVC = await guild.channels.create({
    name: vcName,
    type: ChannelType.GuildVoice,
    userLimit: MAX_VC_USERS,
    parent: categoryId || undefined,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
        ],
      },
    ],
  });

  await configureRankedVC(guild, newVC);

  logger.info(
    { vcId: newVC.id, vcName },
    "Created new private Ranked VC",
  );

  return newVC;
}

/**
 * Autoriza a los jugadores y al supervisor de una partida
 * en un VC competitivo.
 *
 * Llamar antes de moverlos al canal.
 */
export async function authorizeRankedParticipants(
  guild: Guild,
  vcId: string,
  playerIds: string[],
  supervisorId?: string,
): Promise<void> {
  const channel = await guild.channels.fetch(vcId);

  if (!channel || channel.type !== ChannelType.GuildVoice) {
    throw new Error("Canal de voz competitivo no encontrado.");
  }

  await configureRankedVC(
    guild,
    channel,
    playerIds,
    supervisorId,
  );
}

/**
 * Mueve a los jugadores al VC competitivo.
 * Omite a quienes no estén conectados a un canal de voz.
 */
export async function movePlayersToVC(
  guild: Guild,
  targetVcId: string,
  playerIds: string[],
): Promise<{ moved: string[]; skipped: string[] }> {
  await guild.members.fetch();

  const moved: string[] = [];
  const skipped: string[] = [];

  for (const discordId of playerIds) {
    try {
      const member = guild.members.cache.get(discordId);

      if (!member) {
        skipped.push(discordId);
        continue;
      }

      if (!member.voice.channelId) {
        logger.warn(
          { discordId },
          "Cannot move player — not in a voice channel",
        );

        skipped.push(discordId);
        continue;
      }

      await member.voice.setChannel(
        targetVcId,
        "Ranked match starting",
      );

      moved.push(discordId);
    } catch (err) {
      logger.warn(
        { err, discordId },
        "Failed to move player to Ranked VC",
      );

      skipped.push(discordId);
    }
  }

  logger.info(
    {
      targetVcId,
      moved: moved.length,
      skipped: skipped.length,
    },
    "Players moved to Ranked VC",
  );

  return { moved, skipped };
}

/**
 * Silencia o reactiva el audio de todos los miembros del VC.
 */
export async function setVCMute(
  guild: Guild,
  vcId: string,
  mute: boolean,
): Promise<void> {
  const vc = guild.channels.cache.get(vcId);

  if (!vc || vc.type !== ChannelType.GuildVoice) {
    throw new Error("Canal de voz no encontrado.");
  }

  let count = 0;

  for (const [, member] of vc.members) {
    try {
      await member.voice.setMute(
        mute,
        mute ? "Partida en curso" : "Partida pausada",
      );

      count++;
    } catch (err) {
      logger.warn(
        { err, discordId: member.id },
        "Failed to mute/unmute member",
      );
    }
  }

  logger.info(
    { vcId, mute, count },
    "VC mute state changed",
  );
}

/**
 * Desconecta a un miembro del VC.
 */
export async function disconnectFromVC(
  guild: Guild,
  discordId: string,
): Promise<void> {
  try {
    const member = await guild.members.fetch(discordId);

    if (member.voice.channelId) {
      await member.voice.disconnect(
        "Player chose to leave after match",
      );
    }
  } catch (err) {
    logger.warn(
      { err, discordId },
      "Failed to disconnect player from VC",
    );
  }
}

// ── Helpers internos ──────────────────────────────────────────

async function getActiveRankedVcIds(): Promise<Set<string>> {
  const rows = await db
    .select({
      voiceChannelId: lobbysTable.voiceChannelId,
    })
    .from(lobbysTable)
    .where(
      inArray(lobbysTable.status, [...ACTIVE_STATUSES]),
    );

  const ids = new Set<string>();

  for (const row of rows) {
    if (row.voiceChannelId) {
      ids.add(row.voiceChannelId);
    }
  }

  return ids;
}
