
import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from "discord.js";

import {
  canManageMissions,
  createMission,
} from "../services/mission.service";

export const crearmision = {
  data: new SlashCommandBuilder()
    .setName("crearmision")
    .setDescription("Crear una misión semanal por frijoles"),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({
        content: "Este comando solo se puede usar dentro de un servidor.",
        ephemeral: true,
      });
      return;
    }

    const roleIds = interaction.member.roles instanceof Array
      ? interaction.member.roles
      : interaction.member.roles.cache.map((role) => role.id);

    if (!canManageMissions(roleIds)) {
      await interaction.reply({
        content: "No tenés permisos para crear misiones.",
        ephemeral: true,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId("missions:create")
      .setTitle("Crear misión semanal");

    const title = new TextInputBuilder()
      .setCustomId("title")
      .setLabel("Título de la misión")
      .setPlaceholder("Juega por 8 horas")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(100)
      .setRequired(true);

    const reward = new TextInputBuilder()
      .setCustomId("reward")
      .setLabel("Recompensa en frijoles")
      .setPlaceholder("400000")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const action = new TextInputBuilder()
      .setCustomId("action")
      .setLabel("Acción")
      .setPlaceholder("Voz")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const objective = new TextInputBuilder()
      .setCustomId("objective")
      .setLabel("Objetivo numérico")
      .setPlaceholder("8")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(title),
      new ActionRowBuilder<TextInputBuilder>().addComponents(reward),
      new ActionRowBuilder<TextInputBuilder>().addComponents(action),
      new ActionRowBuilder<TextInputBuilder>().addComponents(objective),
    );

    await interaction.showModal(modal);
  },
};

export async function handleCreateMissionModal(
  interaction: ModalSubmitInteraction,
) {
  if (interaction.customId !== "missions:create") return;

  if (!interaction.guild || !interaction.member) {
    await interaction.reply({
      content: "Este formulario requiere un servidor.",
      ephemeral: true,
    });
    return;
  }

  const roleIds = interaction.member.roles instanceof Array
    ? interaction.member.roles
    : interaction.member.roles.cache.map((role) => role.id);

  if (!canManageMissions(roleIds)) {
    await interaction.reply({
      content: "No tenés permisos para crear misiones.",
      ephemeral: true,
    });
    return;
  }

  const title = interaction.fields.getTextInputValue("title").trim();
  const rewardText = interaction.fields.getTextInputValue("reward").trim();
  const action = interaction.fields.getTextInputValue("action").trim();
  const objectiveText = interaction.fields
    .getTextInputValue("objective")
    .trim();

  if (!/^\d+$/.test(rewardText) || !/^\d+$/.test(objectiveText)) {
    await interaction.reply({
      content: "La recompensa y el objetivo deben ser números enteros positivos.",
      ephemeral: true,
    });
    return;
  }

  try {
    const mission = await createMission({
      guildId: interaction.guild.id,
      title,
      reward: Number(rewardText),
      action,
      objective: Number(objectiveText),
      createdBy: interaction.user.id,
    });

    await interaction.reply({
      content: `Misión **#${mission.id} — ${mission.title}** creada correctamente.`,
      ephemeral: true,
    });
  } catch (error) {
    await interaction.reply({
      content: error instanceof Error
        ? error.message
        : "No se pudo crear la misión.",
      ephemeral: true,
    });
  }
}
