
import {
  Events,
  type Client,
  type Message,
} from "discord.js";
import { db, kakeraBankTransfers } from "@workspace/db";
import { logger } from "../../lib/logger";

const SOURCE_GUILD_ID = "1437644356977823884";
const MUDAE_BOT_ID = "432610292342587392";
const SANTIAGO_ID = "909216958891823104";

const LOG_CHANNEL_ID = "1562578969377636464";

const KAKERA_EMOJI_ID = "469835869059153940";
const BEANS_PER_KAKERA = 1_000;
const MAX_KAKERA_PER_TRANSFER = 100_000;

// Coincide con el formato real que compartiste.
const TRANSFER_REGEX =
  /^<@!?(\d+)>\s+le ha regalado\s+\*\*(\d+)\*\*<:kakera:469835869059153940>a\s+<@!?(\d+)>$/;

async function logDetection(
  client: Client,
  details: {
    senderId: string;
    recipientId: string;
    kakeraAmount: number;
    beanAmount: number;
    messageId: string;
  },
): Promise<void> {
  try {
    const channel = await client.channels.fetch(LOG_CHANNEL_ID);

    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      logger.warn("Kakera Bank: el canal de logs no está disponible.");
      return;
    }

    await channel.send({
      content: [
        "🔎 **Kakera Bank · Transferencia detectada**",
        `**Emisor:** <@${details.senderId}> (\`${details.senderId}\`)`,
        `**Destinatario:** <@${details.recipientId}>`,
        `**Kakeras:** ${details.kakeraAmount.toLocaleString("es-ES")}`,
        `**Conversión prevista:** ${details.beanAmount.toLocaleString("es-ES")} beans`,
        `**Mensaje de Mudae:** \`${details.messageId}\``,
        "⚠️ **Estado:** detectada; todavía no se acreditaron beans.",
      ].join("\n"),
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    logger.error({ error }, "Kakera Bank: no se pudo publicar el registro.");
  }
}

async function handleMudaeMessage(
  client: Client,
  message: Message,
): Promise<void> {
  if (message.guildId !== SOURCE_GUILD_ID) return;
  if (message.author.id !== MUDAE_BOT_ID) return;

  const match = TRANSFER_REGEX.exec(message.content);
  if (!match) return;

  const [, senderId, amountText, recipientId] = match;

  // Solo procesamos regalos cuyo destinatario sea Santiago.
  if (recipientId !== SANTIAGO_ID) return;

  const kakeraAmount = Number(amountText);

  if (
    !Number.isSafeInteger(kakeraAmount) ||
    kakeraAmount < 1 ||
    kakeraAmount > MAX_KAKERA_PER_TRANSFER
  ) {
    logger.warn(
      { messageId: message.id, amountText },
      "Kakera Bank: cantidad inválida o superior al límite.",
    );
    return;
  }

  const beanAmount = kakeraAmount * BEANS_PER_KAKERA;

  try {
    const inserted = await db
      .insert(kakeraBankTransfers)
      .values({
        messageId: message.id,
        guildId: message.guildId,
        senderId,
        recipientId,
        kakeraAmount,
        beanAmount,
        status: "detected",
      })
      .onConflictDoNothing()
      .returning({
        messageId: kakeraBankTransfers.messageId,
      });

    // Si el mensaje ya existe, no volvemos a procesarlo.
    if (inserted.length === 0) return;

    logger.info(
      {
        messageId: message.id,
        senderId,
        recipientId,
        kakeraAmount,
        beanAmount,
      },
      "Kakera Bank: transferencia detectada.",
    );

    await logDetection(client, {
      senderId,
      recipientId,
      kakeraAmount,
      beanAmount,
      messageId: message.id,
    });
  } catch (error) {
    logger.error(
      { error, messageId: message.id },
      "Kakera Bank: error al registrar la transferencia.",
    );
  }
}

export function setupKakeraBank(client: Client): void {
  client.on(Events.MessageCreate, (message) => {
    void handleMudaeMessage(client, message);
  });

  logger.info("Kakera Bank: detector de transferencias registrado.");
}
