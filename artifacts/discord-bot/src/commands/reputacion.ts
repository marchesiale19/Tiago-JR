import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type Message,
  type TextChannel,
} from "discord.js";
import {
  ReputationService,
  type TipoReputacion,
} from "../services/ReputationService";

const REPUTATION_LOG_CHANNEL_ID = "1553011896507039905";

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
  giverId: string,
  targetId: string,
  targetName: string,
  channel: any,
  reply?: (payload: any) => Promise<any>,
): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor("Orange")
    .setTitle("⭐ Reputación")
    .setDescription(
      `Que reputación quieres darle a **${targetName}**?\n\n` +
        `👍 **Positiva**\n` +
        `👎 **Negativa**`,
    )
    .setFooter({
      text: "Solo puedes dar reputación al mismo usuario una vez cada 24 horas.",
    });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `reputacion_positiva_${giverId}_${targetId}`,
      )
      .setLabel("Positiva")
      .setEmoji("👍")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(
        `reputacion_negativa_${giverId}_${targetId}`,
      )
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
    return;
  }

  await channel.send(payload);
}

async function sendReputationLog(
  interaction: ButtonInteraction,
  receiverId: string,
  tipo: TipoReputacion,
): Promise<void> {
  try {
    const channel = await interaction.client.channels
      .fetch(REPUTATION_LOG_CHANNEL_ID)
      .catch(() => null);

    if (!channel || !channel.isTextBased()) {
      console.error(
        `❌ No pude encontrar el canal de logs de reputación (${REPUTATION_LOG_CHANNEL_ID}).`,
      );
      return;
    }

    if (!("send" in channel)) {
      console.error(
        "❌ El canal de logs de reputación no permite enviar mensajes.",
      );
      return;
    }

    const isPositive = tipo === "positiva";

    const embed = new EmbedBuilder()
      .setColor(isPositive ? "Green" : "Red")
      .setTitle("⭐ Nueva reputación registrada")
      .addFields(
        {
          name: "👤 Quien dio la reputación",
          value: `<@${interaction.user.id}>\n\`${interaction.user.id}\``,
          inline: true,
        },
        {
          name: "🎯 Usuario recibido",
          value: `<@${receiverId}>\n\`${receiverId}\``,
          inline: true,
        },
        {
          name: "📊 Tipo",
          value: isPositive ? "👍 Positiva" : "👎 Negativa",
          inline: true,
        },
        {
          name: "🏠 Servidor de origen",
          value: interaction.guild
            ? `${interaction.guild.name}\n\`${interaction.guild.id}\``
            : "Desconocido",
          inline: false,
        },
      )
      .setTimestamp()
      .setFooter({
        text: "Sistema de reputación • TiagoJR",
      });

    await (channel as TextChannel).send({
      embeds: [embed],
    });
  } catch (error) {
    console.error(
      "❌ Error enviando log de reputación:",
      error,
    );
  }
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId) return;

  const target = interaction.options.getUser(
    "usuario",
    true,
  );

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
    interaction.user.id,
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
    await message.reply(
      "❌ No puedes darle reputación a un bot.",
    );
    return;
  }

  if (target.id === message.author.id) {
    await message.reply(
      "❌ No puedes darte reputación a ti mismo.",
    );
    return;
  }

  await sendReputationMenu(
    message.author.id,
    target.id,
    target.username,
    message.channel,
  );
}

export async function handleButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const parts = interaction.customId.split("_");

  if (parts.length !== 4) return;

  const tipo = parts[1] as TipoReputacion;
  const giverId = parts[2];
  const receiverId = parts[3];

  if (
    tipo !== "positiva" &&
    tipo !== "negativa"
  ) {
    return;
  }

  if (!interaction.guildId) return;

  // Solo quien creó el menú puede utilizar el botón.
  if (interaction.user.id !== giverId) {
    await interaction.reply({
      content: "❌ Este botón no es para vos.",
      ephemeral: true,
    });
    return;
  }

  // El usuario debe seguir perteneciendo al servidor.
  const member = await interaction.guild?.members
    .fetch(interaction.user.id)
    .catch(() => null);

  if (!member) {
    await interaction.reply({
      content:
        "❌ No pude encontrar tu membresía en este servidor.",
      ephemeral: true,
    });
    return;
  }

  // Registrar la reputación.
  const result =
    await ReputationService.giveReputation(
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

  // Obtener la reputación actualizada.
  const reputation =
    await ReputationService.getReputation(
      interaction.guildId,
      receiverId,
    );

  // Registrar el evento en el servidor de logs.
  await sendReputationLog(
    interaction,
    receiverId,
    tipo,
  );

  // Actualizar el mensaje original.
  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(
          tipo === "positiva"
            ? "Green"
            : "Red",
        )
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
