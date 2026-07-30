// ---------------------------------------------------------------------------
// RankedVCService — Manages Ranked voice channel lifecycle.
//
// Rules:
//   • Ranked VCs are named  「🎙」ranked 1, 「🎙」ranked 2, …
//   • Max 15 users per VC.
//   • VCs are NEVER deleted.  Reuse an unused one; create only when needed.
//   • "Unused" = voiceChannelId not referenced by any active lobby AND fewer
//     than 15 members currently connected.
//   • Moving players requires the bot to have MOVE_MEMBERS permission.
// ---------------------------------------------------------------------------

import {
  Guild, ChannelType, PermissionFlagsBits,
  type VoiceChannel,
} from "discord.js";
import { db } from "../database/database";
import { lobbysTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { getConfig } from "./ConfigService";
import { ConfigKey } from "../database/enums";
import { logger } from "../lib/logger";

const RANKED_VC_PREFIX = "「🎙」ranked ";
const MAX_VC_USERS     = 15;

// Statuses considered "active" (VC is in use)
const ACTIVE_STATUSES = ["queue", "waiting_supervisor", "ready", "in_game", "validating"] as const;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Find the next available Ranked VC, or create a new numbered one.
 * Returns the VoiceChannel object.
 */
export async function getOrCreateRankedVC(guild: Guild): Promise<VoiceChannel> {
  await guild.channels.fetch();

  // Find all channels with the ranked prefix
  const rankedVCs = guild.channels.cache
    .filter((ch): ch is VoiceChannel =>
      ch.type === ChannelType.GuildVoice &&
      ch.name.startsWith(RANKED_VC_PREFIX),
    )
    .sort((a, b) => {
      const numA = parseInt(a.name.replace(RANKED_VC_PREFIX, ""), 10);
      const numB = parseInt(b.name.replace(RANKED_VC_PREFIX, ""), 10);
      return numA - numB;
    });

  // Collect VC IDs currently referenced by active lobbies
  const busyVcIds = await getActiveRankedVcIds();

  // Look for one that is not busy AND has room
  for (const vc of rankedVCs.values()) {
    if (!busyVcIds.has(vc.id) && vc.members.size < MAX_VC_USERS) {
      logger.info({ vcId: vc.id, vcName: vc.name }, "Reusing existing Ranked VC");
      return vc;
    }
  }

  // None available — create the next numbered one
  const nextNumber = rankedVCs.size + 1;
  const vcName     = `${RANKED_VC_PREFIX}${nextNumber}`;

  const categoryId = await getConfig(ConfigKey.RankedVcCategoryId);

  const newVC = await guild.channels.create({
    name:      vcName,
    type:      ChannelType.GuildVoice,
    userLimit: MAX_VC_USERS,
    parent:    categoryId || undefined,
  }) as VoiceChannel;

  logger.info({ vcId: newVC.id, vcName }, "Created new Ranked VC");
  return newVC;
}

/**
 * Move a list of players into the target voice channel.
 * Skips any player who is not currently in a voice channel (cannot force-join).
 */
export async function movePlayersToVC(
  guild:        Guild,
  targetVcId:   string,
  playerIds:    string[],
): Promise<{ moved: string[]; skipped: string[] }> {
  await guild.members.fetch();

  const moved:   string[] = [];
  const skipped: string[] = [];

  for (const discordId of playerIds) {
    try {
      const member = guild.members.cache.get(discordId);
      if (!member) { skipped.push(discordId); continue; }

      if (!member.voice.channelId) {
        logger.warn({ discordId }, "Cannot move player — not in a voice channel");
        skipped.push(discordId);
        continue;
      }

      await member.voice.setChannel(targetVcId, "Ranked match starting");
      moved.push(discordId);
    } catch (err) {
      logger.warn({ err, discordId }, "Failed to move player to Ranked VC");
      skipped.push(discordId);
    }
  }

  logger.info(
    { targetVcId, moved: moved.length, skipped: skipped.length },
    "Players moved to Ranked VC",
  );
  return { moved, skipped };
}

/**
 * Mute or unmute every member currently connected to a voice channel.
 */
export async function setVCMute(
  guild:   Guild,
  vcId:    string,
  mute:    boolean,
): Promise<void> {
  const vc = guild.channels.cache.get(vcId);
  if (!vc || vc.type !== ChannelType.GuildVoice) {
    throw new Error("Canal de voz no encontrado.");
  }

  const voiceChannel = vc as VoiceChannel;
  let count = 0;

  for (const [, member] of voiceChannel.members) {
    try {
      await member.voice.setMute(mute, mute ? "Partida en curso" : "Partida pausada");
      count++;
    } catch (err) {
      logger.warn({ err, discordId: member.id }, "Failed to mute/unmute member");
    }
  }

  logger.info({ vcId, mute, count }, "VC mute state changed");
}

/**
 * Disconnect a single member from the Ranked VC (for "Leave" button).
 */
export async function disconnectFromVC(
  guild:     Guild,
  discordId: string,
): Promise<void> {
  try {
    const member = await guild.members.fetch(discordId);
    if (member.voice.channelId) {
      await member.voice.disconnect("Player chose to leave after match");
    }
  } catch (err) {
    logger.warn({ err, discordId }, "Failed to disconnect player from VC");
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────

async function getActiveRankedVcIds(): Promise<Set<string>> {
  const rows = await db
    .select({ voiceChannelId: lobbysTable.voiceChannelId })
    .from(lobbysTable)
    .where(inArray(lobbysTable.status, [...ACTIVE_STATUSES]));

  const ids = new Set<string>();
  for (const row of rows) {
    if (row.voiceChannelId) ids.add(row.voiceChannelId);
  }
  return ids;
}
