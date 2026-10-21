import {
  Events,
  type Client,
  type Message,
} from "discord.js";
import {
  and,
  eq,
  db,
  kakeraBankTransfers,
} from "@workspace/db";
import { unb } from "../../lib/unbelievaboat";
import { logger } from "../../lib/logger";

const SOURCE_GUILD_ID = "1437644356977823884";
const MUDAE_BOT_ID = "432610292342587392";
const SANTIAGO_ID = "909216958891823104";
const LOG_CHANNEL_ID = "1562578969377636464";

const BEANS_PER_KAKERA = 1_000;
const MAX_KAKERA_PER_TRANSFER = 100_000;

const TRANSFER_REGEX =
  /^<@!?(\d+)>\s+le ha regalado\s+\*\*(\d+)\*\*<:kakera:469835869059153940>a\s+<@!?(\d+)>$/;

type TransferStatus = "credited" | "uncertain";

async function publishLog(
  client: Client,
  content: string,
): Promise<void> {
  try {
    const channel = await client.channels.fetch(LOG_CHANNEL_ID);

    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      logger.error("Kakera Bank: canal de logs no disponible.");
      return;
    }

    await channel.send({
      content,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    logger.error(
      { error },
      "Kakera Bank: no se pudo publicar el registro.",
    );
  }
}

async function setUncertain(messageId: string): Promise<void> {
  await db
    .update(kakeraBankTransfers)
    .set({
      status: "uncertain",
      error: "Resultado del crédito no confirmado; requiere revisión manual.",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(kakeraBankTransfers.messageId, messageId),
        eq(kakeraBankTransfers.status, "processing"),
      ),
    );
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

  // Solo se aceptan regalos destinados a Santiago.
  if (recipientId !== SANTIAGO_ID) return;

  const kakeraAmount = Number(amountText);

  if (
    !Number.isSafeInteger(kakeraAmount) ||
    kakeraAmount < 1 ||
    kakeraAmount > MAX_KAKERA_PER_TRANSFER
  ) {
    logger.warn(
      { messageId: message.id, amountText },
      "Kakera Bank: cantidad inválida.",
    );
    return;
  }

  const beanAmount = kakeraAmount * BEANS_PER_KAKERA;

  // Primero registramos el evento. El ID del mensaje es único.
  try {
    const inserted = await db
      .insert(kakeraBankTransfers)
      .values({
        messageId: message.id,
        guildId: SOURCE_GUILD_ID,
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

    // Un evento repetido nunca vuelve a generar un crédito.
    if (inserted.length === 0) return;
  } catch (error) {
    logger.error(
      { error, messageId: message.id },
      "Kakera Bank: no se pudo registrar la transferencia.",
    );
    return;
  }

  // Reclamamos el evento antes de llamar a UnbelievaBoat.
  try {
    const claimed = await db
      .update(kakeraBankTransfers)
      .set({
        status: "processing",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(kakeraBankTransfers.messageId, message.id),
          eq(kakeraBankTransfers.status, "detected"),
        ),
      )
      .returning({
        messageId: kakeraBankTransfers.messageId,
      });

    if (claimed.length === 0) return;
  } catch (error) {
    logger.error(
      { error, messageId: message.id },
      "Kakera Bank: no se pudo reclamar la transferencia.",
    );
    return;
  }

  // Si falla la llamada, no sabemos si el API aplicó el crédito.
  // Por eso NO se reintenta automáticamente.
  try {
    await unb.editUserBalance(
      SOURCE_GUILD_ID,
      senderId,
      { bank: beanAmount },
    );
  } catch (error) {
    logger.error(
      { error, messageId: message.id, senderId, beanAmount },
      "Kakera Bank: resultado del crédito incierto.",
    );

    try {
      await setUncertain(message.id);
    } catch (dbError) {
      logger.error(
        { dbError, messageId: message.id },
        "Kakera Bank: no se pudo guardar el estado incierto. Revisar manualmente.",
      );
    }

    await publishLog(
      client,
      [
        "⚠️ **Kakera Bank · Revisión manual requerida**",
        `Emisor: <@${senderId}> (\`${senderId}\`)`,
        `Kakeras: ${kakeraAmount}`,
        `Crédito intentado: ${beanAmount.toLocaleString("es-ES")} beans`,
        `Mensaje: \`${message.id}\``,
        "No se realizará otro intento automático porque el resultado no está confirmado.",
      ].join("\n"),
    );

    return;
  }

  // La API respondió correctamente. Guardamos la confirmación.
  try {
    await db
      .update(kakeraBankTransfers)
      .set({
        status: "credited",
        error: null,
        creditedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(kakeraBankTransfers.messageId, message.id),
          eq(kakeraBankTransfers.status, "processing"),
        ),
      );
  } catch (error) {
    logger.error(
      { error, messageId: message.id, senderId, beanAmount },
      "Kakera Bank: API respondió, pero no se pudo confirmar el estado en la DB.",
    );

    await publishLog(
      client,
      [
        "⚠️ **Kakera Bank · Conciliación requerida**",
        `Emisor: <@${senderId}> (\`${senderId}\`)`,
        `Importe: ${beanAmount.toLocaleString("es-ES")} beans`,
        `Mensaje: \`${message.id}\``,
        "La API respondió correctamente, pero no se pudo guardar la confirmación. No repetir el crédito sin revisar el saldo.",
      ].join("\n"),
    );

    return;
  }

  await publishLog(
    client,
    [
      "✅ **Kakera Bank · Crédito confirmado por la API**",
      `Emisor: <@${senderId}> (\`${senderId}\`)`,
      `Destinatario Mudae: <@${SANTIAGO_ID}>`,
      `Kakeras: ${kakeraAmount}`,
      `Beans acreditados: ${beanAmount.toLocaleString("es-ES")}`,
      `Mensaje: \`${message.id}\``,
    ].join("\n"),
  );

  try {
    await message.reply({
      content:
        `✅ <@${senderId}>, tu transferencia de ${kakeraAmount} kakera(s) fue procesada. ` +
        `Se acreditaron ${beanAmount.toLocaleString("es-ES")} beans en tu banco.`,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    logger.warn(
      { error, messageId: message.id },
      "Kakera Bank: crédito confirmado, pero no se pudo publicar la confirmación.",
    );
  }
}

export function setupKakeraBank(client: Client): void {
  // Operaciones que quedaron abiertas tras un reinicio:
  // se marcan para revisión, nunca se vuelven a acreditar a ciegas.
  void db
    .update(kakeraBankTransfers)
    .set({
      status: "uncertain",
      error: "El bot se reinició durante el procesamiento; revisar manualmente.",
      updatedAt: new Date(),
    })
    .where(eq(kakeraBankTransfers.status, "processing"))
    .then(() => {
      logger.info("Kakera Bank: revisión de operaciones pendientes completada.");
    })
    .catch((error) => {
      logger.error(
        { error },
        "Kakera Bank: no se pudieron revisar las operaciones pendientes.",
      );
    });

  client.on(Events.MessageCreate, (message) => {
    void handleMudaeMessage(client, message);
  });

  logger.info("Kakera Bank: detector y procesador registrados.");
}
