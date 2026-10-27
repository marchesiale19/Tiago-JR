
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";

import { and, eq } from "drizzle-orm";
import { db, missions, missionProgress } from "../database/database";
import { canManageMissions } from "../services/mission.service";

export const data = new SlashCommandBuilder()
  .setName("borrarmision")
  .setDescription("Eliminar una misión semanal por frijoles")
  .addIntegerOption((option) =>
    option
      .setName("id")
      .setDescription("ID de la misión que querés eliminar")
      .setRequired(true)
      .setMinValue(1),
  );

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

  if (!canManageMissions(interaction.member.roles instanceof Array
    ? interaction.member.roles
    : interaction.member.roles.cache.map((role) => role.id))) {
    await interaction.reply({
      content: "No tenés permisos para eliminar misiones.",
      ephemeral: true,
    });
    return;
  }

  const missionId = interaction.options.getInteger("id", true);

  await interaction.deferReply({ ephemeral: true });

  try {
    const deleted = await eliminarMision(interaction.guild.id, missionId);

    await interaction.editReply(
      deleted
        ? `La misión **#${missionId}** y su progreso asociado fueron eliminados correctamente.`
        : `No se encontró la misión **#${missionId}** en este servidor.`,
    );
  } catch (error) {
    console.error("[Misiones] Error al eliminar la misión:", error);
    await interaction.editReply(
      "No se pudo eliminar la misión. Intentá nuevamente más tarde.",
    );
  }
}

export async function run(
  message: Message,
  args: string[],
): Promise<void> {
  if (!message.guild || !message.member) {
    await message.reply(
      "Este comando solo se puede usar dentro de un servidor.",
    );
    return;
  }

  if (!canManageMissions(message.member.roles.cache.map((role) => role.id))) {
    await message.reply("No tenés permisos para eliminar misiones.");
    return;
  }

  const missionId = Number(args[0]);

  if (!Number.isSafeInteger(missionId) || missionId < 1) {
    await message.reply(
      "Indicá un ID válido. Ejemplo: `-borrarmision 3`",
    );
    return;
  }

  try {
    const deleted = await eliminarMision(message.guild.id, missionId);

    await message.reply(
      deleted
        ? `La misión **#${missionId}** y su progreso asociado fueron eliminados correctamente.`
        : `No se encontró la misión **#${missionId}** en este servidor.`,
    );
  } catch (error) {
    console.error("[Misiones] Error al eliminar la misión:", error);
    await message.reply(
      "No se pudo eliminar la misión. Intentá nuevamente más tarde.",
    );
  }
}

async function eliminarMision(
  guildId: string,
  missionId: number,
): Promise<boolean> {
  const [mission] = await db
    .select({ id: missions.id })
    .from(missions)
    .where(
      and(
        eq(missions.id, missionId),
        eq(missions.guildId, guildId),
      ),
    )
    .limit(1);

  if (!mission) return false;

  await db.delete(missionProgress).where(
    and(
      eq(missionProgress.missionId, missionId),
      eq(missionProgress.guildId, guildId),
    ),
  );

  await db.delete(missions).where(
    and(
      eq(missions.id, missionId),
      eq(missions.guildId, guildId),
    ),
  );

  return true;
}
