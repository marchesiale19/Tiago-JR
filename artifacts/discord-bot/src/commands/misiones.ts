
import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Message,
  type Guild,
} from "discord.js";

import {
  db,
  missions,
  missionProgress,
} from "../database/database";

import { getWeekKey } from "../services/mission.service";
import { and, eq } from "drizzle-orm";

export const data = new SlashCommandBuilder()
  .setName("misiones")
  .setDescription("Ver las misiones semanales por frijoles");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "Este comando solo se puede usar dentro de un servidor.",
      ephemeral: true,
    });
    return;
  }

  try {
    const embed = await crearEmbedMisiones(
      interaction.guild,
      interaction.user.id,
    );

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("[Misiones] Error al consultar las misiones:", error);

    await interaction.reply({
      content:
        "No se pudieron cargar las misiones. Intentá nuevamente más tarde.",
      ephemeral: true,
    });
  }
}

export async function run(
  message: Message,
  _args: string[],
): Promise<void> {
  if (!message.guild) {
    await message.reply(
      "Este comando solo se puede usar dentro de un servidor.",
    );
    return;
  }

  try {
    const embed = await crearEmbedMisiones(
      message.guild,
      message.author.id,
    );

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error("[Misiones] Error al consultar las misiones:", error);

    await message.reply(
      "No se pudieron cargar las misiones. Intentá nuevamente más tarde.",
    );
  }
}

/**
 * Conserva los formatos de mención de Discord para que los roles
 * y canales se rendericen como menciones dentro del embed.
 */
function resolverMenciones(
  texto: string,
  guild: Guild,
): string {
  return texto.replace(
    /<@&(\d+)>|<#(\d+)>/g,
    (mencion, rolId, canalId) => {
      if (rolId) {
        const rol = guild.roles.cache.get(rolId);

        return rol ? `<@&${rol.id}>` : "@rol desconocido";
      }

      if (canalId) {
        const canal = guild.channels.cache.get(canalId);

        return canal ? `<#${canal.id}>` : "#canal-desconocido";
      }

      return mencion;
    },
  );
}

async function crearEmbedMisiones(
  guild: Guild,
  userId: string,
): Promise<EmbedBuilder> {
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

    const status = progress?.completed
      ? progress.paid
        ? "Completada y pagada."
        : "Completada; recompensa pendiente."
      : "En progreso.";

    const description = [
      `**Recompensa:** ${Number(mission.reward).toLocaleString("es-AR")} frijoles`,
      `**Acción:** ${resolverMenciones(mission.action, guild)}`,
      `**Creada por:** ${creatorName}`,
      `**Progreso:** ${currentValue}/${mission.objective} horas`,
      `**Estado:** ${status}`,
    ].join("\n");

    embed.addFields({
      name: `#${mission.id} — ${resolverMenciones(mission.title, guild)}`,
      value: description,
      inline: false,
    });
  }

  return embed;
}
