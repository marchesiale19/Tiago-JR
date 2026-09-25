import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type Message,
} from "discord.js";
import { ReputationService, type TipoReputacion } from "../services/ReputationService";

export const data = new SlashCommandBuilder()
  .setName("rep")
  .setDescription("Da reputación a otro usuario.")
  .addUserOption((option) =>
    option
      .setName("usuario")
      .setDescription("Usuario al que quieres dar reputación")
      .setRequired(true),
  );

async function sendReputationMenu(
  targetId: string,
  targetName: string,
  channel: any,
  reply?: (payload: any) => Promise<any>,
) {
  const embed = new EmbedBuilder()
    .setColor("Orange")
    .setTitle("⭐ Reputación")
    .setDescription(
      `¿Qué reputación quieres darle a **${targetName}**?\n\n` +
      `👍 **Positiva**\n` +
      `👎 **Negativa**`,
    )
    .setFooter({
      text: "Solo puedes dar reputación al mismo usuario una vez cada 24 horas.",
    });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`reputacion_positiva_${targetId}`)
      .setLabel("Positiva")
      .setEmoji("👍")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`reputacion_negativa_${targetId}`)
      .setLabel("Negativa")
      .setEmoji("👎")
      .setStyle(ButtonStyle.Danger),
  );

  const payload = {
    embeds: [embed],
    components: [row],
  };

  if (reply) {
    await reply(payload);
  } else {
    await channel.send(payload);
  }
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId) return;

  const target = interaction.options.getUser("usuario", true);

  if (target.bot) {
    await interaction.reply({
      content: "❌ No puedes darle reputación a un bot.",
      ephemeral: true,
    });
    return;
  }

  if (target.id === interaction.user.id) {
    await interaction.reply({
      content: "❌ No puedes darte reputación a ti mismo.",
      ephemeral: true,
    });
    return;
  }

  await sendReputationMenu(
    target.id,
    target.username,
    interaction.channel,
    async (payload) => {
      await interaction.reply(payload);
    },
  );
}

export async function run(
  message: Message,
  args: string[],
): Promise<void> {
  if (!message.guildId) return;

  const target = message.mentions.users.first();

  if (!target) {
    await message.reply(
      "❌ Uso correcto: `-rep @usuario`",
    );
    return;
  }

  if (target.bot) {
    await message.reply("❌ No puedes darle reputación a un bot.");
    return;
  }

  if (target.id === message.author.id) {
    await message.reply("❌ No puedes darte reputación a ti mismo.");
    return;
  }

  await sendReputationMenu(
    target.id,
    target.username,
    message.channel,
  );
}

export async function handleButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const parts = interaction.customId.split("_");

  if (parts.length !== 3) return;

  const tipo = parts[1] as TipoReputacion;
  const receiverId = parts[2];

  if (tipo !== "positiva" && tipo !== "negativa") return;

  if (!interaction.guildId) return;

  const member = await interaction.guild?.members
    .fetch(interaction.user.id)
    .catch(() => null);

  if (!member) {
    await interaction.reply({
      content: "❌ No pude encontrar tu membresía en este servidor.",
      ephemeral: true,
    });
    return;
  }

  const result = await ReputationService.giveReputation(
    interaction.guildId,
    interaction.user.id,
    receiverId,
    tipo,
    member.joinedAt,
  );

  if (!result.success) {
    await interaction.reply({
      content: result.message,
      ephemeral: true,
    });
    return;
  }

  const reputation = await ReputationService.getReputation(
    interaction.guildId,
    receiverId,
  );

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(tipo === "positiva" ? "Green" : "Red")
        .setTitle("⭐ Reputación registrada")
        .setDescription(
          `${tipo === "positiva" ? "👍" : "👎"} ${result.message}\n\n` +
          `**Reputación actual de <@${receiverId}>:**\n` +
          `👍 Positivas: **${reputation.positivas}**\n` +
          `👎 Negativas: **${reputation.negativas}**\n` +
          `📊 Total: **${reputation.total}**`,
        ),
    ],
    components: [],
  });
}
