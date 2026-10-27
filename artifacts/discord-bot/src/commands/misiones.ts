import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";

import { db } from "../database";
import { missions, missionProgress } from "../database/schema/missions";
import { getWeekKey } from "../services/mission.service";
import { and, eq } from "drizzle-orm";

export const data = new SlashCommandBuilder()
  .setName("misiones")
  .setDescription("Ver las misiones semanales por frijoles");

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: "Este comando solo se puede usar dentro de un servidor.",
      ephemeral: true,
    });
    return;
  }

  const embed = await crearEmbedMisiones(
    interaction.guild,
    interaction.user.id,
  );

  await interaction.reply({ embeds: [embed] });
}

export async function run(message: Message, _args: string[]) {
  if (!message.guild) {
    await message.reply("Este comando solo se puede usar dentro de un servidor.");
    return;
  }

  const embed = await crearEmbedMisiones(
    message.guild,
    message.author.id,
  );

  await message.reply({ embeds: [embed] });
}

async function crearEmbedMisiones(
  guild: NonNullable<Message["guild"]>,
  userId: string,
) {
  const activeMissions = await db
    .select()
    .from(missions)
    .where(
      and(
        eq(missions.guildId, guild.id),
        eq(missions.weekKey, getWeekKey()),
        eq(missions.active, true),
      ),
    )
    .orderBy(missions.id);

  const embed = new EmbedBuilder()
    .setTitle("Misiones por Frijoles")
    .setColor(0xf1c40f)
    .setDescription(
      activeMissions.length === 0
        ? "No hay misiones activas esta semana."
        : "Completá las misiones semanales para recibir tus recompensas.",
    );

  for (const mission of activeMissions) {
    const [progress] = await db
      .select()
      .from(missionProgress)
      .where(
        and(
          eq(missionProgress.missionId, mission.id),
          eq(missionProgress.guildId, guild.id),
          eq(missionProgress.userId, userId),
        ),
      )
      .limit(1);

    const currentValue = progress
      ? Math.min(
          mission.objective,
          Math.floor(progress.progressSeconds / 3600),
        )
      : 0;

    const creator = await guild.members
      .fetch(mission.createdBy)
      .catch(() => null);

    const creatorName = creator?.displayName ?? "Staff desconocido";

    const description = [
      `**Recompensa:** ${mission.reward.toLocaleString("es-AR")} frijoles`,
      `**Acción:** ${mission.action}`,
      `**Creada por:** ${creatorName}`,
      `**Progreso:** ${currentValue}/${mission.objective} horas`,
      progress?.completed
        ? progress.paid
          ? "Estado: Completada y pagada."
          : "Estado: Completada; recompensa pendiente."
        : "Estado: En progreso.",
    ].join("\n");

    embed.addFields({
      name: `#${mission.id} — ${mission.title}`,
      value: description,
      inline: false,
    });
  }

  return embed;
}
