import cron from "node-cron";
import { and, eq, ne } from "drizzle-orm";


import { db } from "../../database";
import {
missions,
missionProgress,
} from "../../database/schema/missions";
import { getWeekKey } from "./mission.service";

export async function resetWeeklyMissions() {
const currentWeek = getWeekKey();

const expiredMissions = await db
.select({ id: missions.id })
.from(missions)
.where(
and(
eq(missions.active, true),
ne(missions.weekKey, currentWeek),
),
);

for (const mission of expiredMissions) {
// Desactivar y limpiar el progreso de forma atómica
// respecto de las operaciones de PostgreSQL.
await db.transaction(async (tx) => {
await tx
.update(missions)
.set({ active: false })
.where(eq(missions.id, mission.id));

await tx
.update(missionProgress)
.set({
progressSeconds: 0,
sessionStartedAt: null,
})
.where(eq(missionProgress.missionId, mission.id));
});
}
}

export function startWeeklyMissionJob() {
cron.schedule(
"0 0 * * 1",
async () => {
try {
await resetWeeklyMissions();
console.log("[Missions] Reset semanal completado.");
} catch (error) {
console.error("[Missions] Falló el reset semanal:", error);
}
},
{ timezone: "America/Cuiaba" },
);
}
