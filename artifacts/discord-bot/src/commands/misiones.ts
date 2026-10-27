import {
  EmbedBuilder,
  type Message,
} from "discord.js";

import { db } from "../database";
import {
  missions,
  missionProgress,
} from "../database/schema/missions";
import { getWeekKey } from "../services/missions/mission.service";
import { and, eq } from "drizzle-orm";

export async function executeMisiones(message: Message) {
  if (!message.guild) return;

const activeMissions = await db
    .select()
    .from(missions)
    .where(
      and(
        eq(missions.guildId, message.guild.id),
        eq(missions.weekKey, getWeekKey()),
        eq(missions.active, true),
      ),
    )
    .orderBy(missions.id);

if (activeMissions.length === 0) {
    await message.reply("No hay misiones activas esta semana.");
    return;
  }

const embed = new EmbedBuilder()
    .setTitle("Misiones por Frijoles")
    .setColor(0xf1c40f)
    .setDescription(
      "Completá las misiones semanales para recibir tus recompensas.",
    );

for (const mission of activeMissions) {
    const [progress] = await db
      .select()
      .from(missionProgress)
      .where(
        and(
          eq(missionProgress.missionId, mission.id),
          eq(missionProgress.guildId, message.guild.id),
          eq(missionProgress.userId, message.author.id),
        ),
      )
      .limit(1);

const currentValue = progress
      ? Math.min(
          mission.objective,
          Math.floor(progress.progressSeconds / 3600),
        )
      : 0;

const creator = await message.guild.members
      .fetch(mission.createdBy)
      .catch(() => null);

    const creatorName = creator?.displayName ?? "Staff desconocido";

const description = [
**Recompensa:** \$` frijoles,   Hecha por: $,   Categoría: $`,
progress?.completed
? progress.paid
? "Estado: Completada y pagada."
: "Estado: Completada; recompensa pendiente."
: "Estado: En progreso.",
].join("\n");

embed.addFields({
name: $DIL0 — $DIL1/$DIL2 horas,
value: description,
inline: false,
});
}

await message.reply({ embeds: [embed] });
}
