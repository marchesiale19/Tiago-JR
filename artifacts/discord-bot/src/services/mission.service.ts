
import { and, eq } from "drizzle-orm";
import { missions, missionProgress } from "@workspace/db";

// Ajustá esta importación a la ruta real de tu conexión Drizzle.
import { db } from "../../database/database";

export const MISSION_MANAGER_ROLES = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1522434536796061816", // Desarrollador
  "1503876451315880016", // Administrador
  "1509760475653472287", // Administrador PB
  "1522807097920720967", // Manager
] as const;

export const AFK_CHANNEL_ID = "1478566817579667600";
export const VOICE_ACTION = "Voz";

export function canManageMissions(roleIds: string[]): boolean {
  return MISSION_MANAGER_ROLES.some((id) => roleIds.includes(id));
}

export function getWeekKey(date = new Date()): string {
  // Fecha civil en la zona horaria de Mato Grosso.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((part) => part.type === type)!.value;

  const localDate = new Date(
    `${get("year")}-${get("month")}-${get("day")}T12:00:00Z`,
  );

  const weekday = localDate.getUTCDay() || 7;
  localDate.setUTCDate(localDate.getUTCDate() - weekday + 1);

  return [
    localDate.getUTCFullYear(),
    String(localDate.getUTCMonth() + 1).padStart(2, "0"),
    String(localDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export async function createMission(input: {
  guildId: string;
  title: string;
  reward: number;
  action: string;
  objective: number;
  createdBy: string;
}) {
  const title = input.title.trim();
  const action = input.action.trim();

  if (!title || title.length > 100) {
    throw new Error("El título debe tener entre 1 y 100 caracteres.");
  }

  if (!Number.isSafeInteger(input.reward) || input.reward <= 0) {
    throw new Error("La recompensa debe ser un entero positivo.");
  }

  if (
    !Number.isSafeInteger(input.objective) ||
    input.objective <= 0
  ) {
    throw new Error("El objetivo debe ser un entero positivo.");
  }

  if (action.toLowerCase() !== "voz") {
    throw new Error("Por ahora, la única acción disponible es Voz.");
  }

  const [mission] = await db
    .insert(missions)
    .values({
      ...input,
      title,
      action: VOICE_ACTION,
      weekKey: getWeekKey(),
      active: true,
    })
    .returning();

  return mission;
}

export async function getActiveMissions(guildId: string) {
  return db
    .select()
    .from(missions)
    .where(
      and(
        eq(missions.guildId, guildId),
        eq(missions.weekKey, getWeekKey()),
        eq(missions.active, true),
      ),
    )
    .orderBy(missions.id);
}

export async function getUserMissionProgress(
  guildId: string,
  userId: string,
  missionId: number,
) {
  const [row] = await db
    .select()
    .from(missionProgress)
    .where(
      and(
        eq(missionProgress.guildId, guildId),
        eq(missionProgress.userId, userId),
        eq(missionProgress.missionId, missionId),
      ),
    )
    .limit(1);

  return row ?? null;
}
