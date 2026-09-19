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
import pkg from "unb-api";
const { Client: UnbClient } = pkg;
import { logger } from "../lib/logger";

const unb = new UnbClient(process.env.UNBELIEVABOAT_API_KEY as string);

// ID o nombre del canal de staff/logs donde los altos rangos podrán ver la identidad real
const STAFF_LOG_CHANNEL_ID = process.env.STAFF_LOG_CHANNEL_ID || ""; 

export const data = new SlashCommandBuilder()
  .setName("mensaje")
  .setDescription("Envía un mensaje anónimo (y opcionalmente frijoles) a otro usuario.")
  .addUserOption((option) =>
    option
      .setName("destinatario")
      .setDescription("Usuario al que va dirigido el mensaje anónimo")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("texto")
      .setDescription("El contenido de tu mensaje o confesión")
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("regalo")
      .setDescription("Cantidad de frijoles a regalar (opcional)")
      .setMinValue(1)
      .setRequired(false),
  );

async function processAnonymousMessage(
  guildId: string,
  sender: { id: string; toString(): string; tag: string },
  recipient: { id: string; bot: boolean; toString(): string; send: Function },
  text: string,
  giftAmount: number,
  channel: any,
  isSlash: boolean,
  interaction?: ChatInputCommandInteraction
) {
  if (recipient.bot || recipient.id === sender.id) {
    const content = "❌ No puedes enviarte un mensaje anónimo a ti mismo ni a un bot.";
    if (isSlash && interaction) {
      await interaction.reply({ content, ephemeral: true });
    } else {
      await channel.send({ content });
    }
    return;
  }

  if (isSlash && interaction) {
    await interaction.deferReply({ ephemeral: true });
  }

  try {
    // Si hay regalo en frijoles, validamos y descontamos la economía
    if (giftAmount > 0) {
      const balance = await unb.getUserBalance(guildId, sender.id);
      const cash = balance.cash || 0;

      if (cash < giftAmount) {
        const errorMsg = "❌ No tienes suficientes frijoles para enviar este regalo.";
        if (isSlash && interaction) {
          await interaction.editReply({ content: errorMsg });
        } else {
          await channel.send({ content: errorMsg });
        }
        return;
      }

      // Transferencia: Descontamos al emisor y se los sumamos al destinatario
      await unb.editUserBalance(guildId, sender.id, { cash: -giftAmount });
      await unb.editUserBalance(guildId, recipient.id, { cash: giftAmount });
    }

    // Construimos el Embed para el destinatario
    const embed = new EmbedBuilder()
      .setColor("Purple")
      .setTitle("💌 Has recibido un Mensaje Anónimo")
      .setDescription(`> *"${text}"*`)
      .setTimestamp();

    if (giftAmount > 0) {
      embed.addFields({
        name: "🎁 Regalo Adjunto",
        value: `Has recibido **${giftAmount.toLocaleString()} Frijoles** junto con este mensaje.`,
        inline: false,
      });
    }

    // Intentamos enviar el MD al destinatario
    let deliveredViaDM = true;
    try {
      await recipient.send({ embeds: [embed] });
    } catch (dmErr) {
      deliveredViaDM = false;
      // Si tiene los MD cerrados, se puede enviar a un canal de confesiones o notificar en el chat actual de forma discreta
      logger.warn({ err: dmErr }, "No se pudo enviar el MD anónimo al usuario, DMs cerrados.");
    }

    // Respuesta de confirmación privada para el creador del mensaje
    const successNotice = deliveredViaDM
      ? "✅ ¡Tu mensaje anónimo (y tu regalo, si aplicaba) ha sido enviado con éxito por mensaje directo!"
      : "⚠️ Tu mensaje fue procesado, pero el usuario tiene los **mensajes directos cerrados** y no pudo ser entregado.";

    if (isSlash && interaction) {
      await interaction.editReply({ content: successNotice });
    } else {
      await channel.send({ content: `<@${sender.id}> ${successNotice}` }).then((msg: Message) => {
        setTimeout(() => msg.delete().catch(() => {}), 7000); // Borra el aviso público tras unos segundos por privacidad
      });
    }

    // Registro de seguridad para los Altos Rangos (Staff Logs)
    if (STAFF_LOG_CHANNEL_ID) {
      const logChannel = channel.guild?.channels.cache.get(STAFF_LOG_CHANNEL_ID) as TextChannel;
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor("DarkRed")
          .setTitle("🛡️ Log de Seguridad: Mensaje Anónimo")
          .addFields(
            { name: "Remitente Real (Oculto)", value: `<@${sender.id}> (${sender.tag})`, inline: true },
            { name: "Destinatario", value: `<@${recipient.id}>`, inline: true },
            { name: "Regalo", value: `${giftAmount > 0 ? `${giftAmount.toLocaleString()} Frijoles` : "Ninguno"}`, inline: true },
            { name: "Contenido", value: text, inline: false }
          )
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
    }

  } catch (err: any) {
    logger.error({ err }, "Error al procesar el mensaje anónimo");
    const errMsg = `❌ Ocurrió un error al enviar el mensaje anónimo: ${err?.message}`;
    if (isSlash && interaction) {
      await interaction.editReply({ content: errMsg });
    } else {
      await channel.send({ content: errMsg });
    }
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) return;
  const sender = interaction.user;
  const recipient = interaction.options.getUser("destinatario", true);
  const text = interaction.options.getString("texto", true);
  const giftAmount = interaction.options.getInteger("regalo") || 0;

  await processAnonymousMessage(
    interaction.guildId,
    sender,
    recipient,
    text,
    giftAmount,
    interaction.channel,
    true,
    interaction
  );
}

export async function run(message: Message, args: string[]): Promise<void> {
  if (!message.guildId) return;

  const recipient = message.mentions.users.first();
  if (!recipient) {
    await message.reply("❌ Uso correcto: `-mensaje @usuario <texto> [regalo_en_frijoles]`");
    return;
  }

  // Limpiamos la mención de los argumentos para extraer el texto y el posible regalo numérico al final
  const cleanArgs = args.filter((arg) => !arg.includes(recipient.id));
  
  if (cleanArgs.length === 0) {
    await message.reply("❌ Debes escribir un mensaje para enviar.");
    return;
  }

  // Verificamos si el último argumento es un número (el regalo)
  let giftAmount = 0;
  const lastArg = cleanArgs[cleanArgs.length - 1];
  if (!isNaN(Number(lastArg)) && cleanArgs.length > 1) {
    giftAmount = parseInt(lastArg, 10);
    cleanArgs.pop(); // Removemos el número del texto del mensaje
  }

  const text = cleanArgs.join(" ");

  if (!text.trim()) {
    await message.reply("❌ El contenido del mensaje no puede estar vacío.");
    return;
  }

  await processAnonymousMessage(
    message.guildId,
    message.author,
    recipient,
    text,
    giftAmount,
    message.channel,
    false
  );
}

export async function handleButton(_interaction: ButtonInteraction): Promise<void> {}
