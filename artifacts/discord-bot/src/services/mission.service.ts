
import { and, eq } from "drizzle-orm";
import { missions, missionProgress } from "@workspace/db/schema";

export const MISSION_MANAGER_ROLES = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485100476875874997", // Administrador Elite
  "1522434536796061816", // Desarrollador
  "1503876451315880016", // Administrador
  "1509760475653472287", // Administrador PB
  "1522807097920720967", // Manager
] as const;

export const AFK_CHANNEL_ID = "1478566817579667600";
export const VOICE_ACTION = "Voz";

/**
 * Comprueba si alguno de los roles del usuario
 * le permite administrar las misiones.
 */
export function canManageMissions(roleIds: string[]): boolean {
  return MISSION_MANAGER_ROLES.some((id) => roleIds.includes(id));
}

/**
 * Devuelve la clave de la semana actual según
 * la zona horaria de Mato Grosso (America/Cuiaba).
 *
 * La semana comienza el lunes.
 * Formato: YYYY-MM-DD, correspondiente al lunes.
 */
export function getWeekKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string): string => {
    const value = parts.find((part) => part.type === type)?.value;

    if (!value) {
      throw new Error(`No se pudo obtener la parte de fecha: ${type}`);
    }

    return value;
  };

  // Se reconstruye la fecha usando UTC para calcular el lunes
  // sin depender de la zona horaria del servidor.
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

/**
 * Crea una misión para la semana actual.
 */
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

  if (!Number.isSafeInteger(input.objective) || input.objective <= 0) {
    throw new Error("El objetivo debe ser un entero positivo.");
  }

  if (action.toLowerCase() !== VOICE_ACTION.toLowerCase()) {
    throw new Error("Por ahora, la única acción disponible es Voz.");
  }

  // La conexión se importa solo cuando se necesita consultar la DB.
  const { db } = await import("../../database/database");

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

  if (!mission) {
    throw new Error("No se pudo crear la misión en la base de datos.");
  }

  return mission;
}

/**
 * Obtiene las misiones activas de la semana actual
 * para el servidor indicado.
 */
export async function getActiveMissions(guildId: string) {
  const { db } = await import("../../database/database");

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

/**
 * Obtiene el progreso de un usuario en una misión.
 * Devuelve null si todavía no existe un registro.
 */
export async function getUserMissionProgress(
  guildId: string,
  userId: string,
  missionId: number,
) {
  const { db } = await import("../../database/database");

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
