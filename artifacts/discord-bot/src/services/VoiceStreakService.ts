
import {
  Events,
  type Client,
  type VoiceState,
} from "discord.js";
import { and, eq } from "drizzle-orm";

import { db } from "@workspace/db";
import {
  voiceStreaksTable,
  voiceStreakHistoryTable,
  voiceStreakRewardsTable,
} from "@workspace/db/schema";
import { unb } from "../lib/unbelievaboat";

const REQUIRED_PRESENT_SECONDS = 5 * 60;
const STREAK_GRACE_HOURS = 48;
const STREAK_REWARD_AMOUNT = 100_000;
const STREAK_REWARD_INTERVAL = 10;
const CHECK_INTERVAL_MS = 15_000;
const TIME_ZONE = "America/Cuiaba";

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

function getLocalDate(date: Date = new Date()): string {
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

function getKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function isAllowedVoiceChannel(channelId: string | null): boolean {
  return (
    channelId !== null &&
    ALLOWED_VOICE_CHANNEL_IDS.has(channelId)
  );
}

// El seguimiento de presencia y la lógica de rachas se implementarán aquí.
// No modificar ni reutilizar la tabla del sistema de recompensas por horas.

