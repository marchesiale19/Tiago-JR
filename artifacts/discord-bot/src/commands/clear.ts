import {
  type Message,
  type TextChannel,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../lib/logger";

/* ========================================================================== */
/*                          ROLES AUTORIZADOS CLEAR                           */
/* ========================================================================== */

const AUTHORIZED_CLEAR_ROLES = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1455419124732657801", // Equipo Administrativo
  "1522434536796061816", // Desarrollador
  "1453211902267228160", // Administrador
  "1509760475653472287", // Administrador [PB]
  "1539368076326473868", // Developer Tiago Jr
];

/* ========================================================================== */
/*                              EJECUTAR CLEAR                                */
/* ========================================================================== */

export async function run(
  message: Message,
  args: string[],
): Promise<void> {
  if (!message.guildId || !message.guild) {
    await message.reply(
      "❌ Este comando solamente se puede usar en servidores.",
    );
    return;
  }

  // Verificar permisos del usuario
  const member = await message.guild.members
    .fetch(message.author.id)
    .catch(() => null);

  const hasPermission =
    Boolean(member) &&
    (member!.permissions.has(PermissionFlagsBits.Administrator) ||
      member!.roles.cache.some((role) =>
        AUTHORIZED_CLEAR_ROLES.includes(role.id),
      ));

  if (!hasPermission) {
    await message.reply(
      "❌ No tenés los permisos necesarios para usar el comando `-clear`.",
    );
    return;
  }

  if (args.length === 0) {
    await message.reply(
      "❌ Uso incorrecto.\n" +
        "• Usos válidos:\n" +
        "  `-clear <cantidad>`\n" +
        "  `-clear @usuario <cantidad>`\n" +
        "  `-clear #canal <cantidad>`\n" +
        "  `-clear #canal @usuario <cantidad>`",
    );
    return;
  }

  let targetChannel: TextChannel = message.channel as TextChannel;
  let targetUser = message.mentions.users.first();
  let amount: number | null = null;

  // Filtrar los argumentos para detectar canal, usuario y número
  const cleanArgs = args.filter((arg) => {
    // Si es mención de canal
    if (/^<#\d+>$/.test(arg)) {
      const channelId = arg.replace(/[<#>]/g, "");
      const foundChannel = message.guild?.channels.cache.get(channelId);
      if (foundChannel && foundChannel.isTextBased()) {
        targetChannel = foundChannel as TextChannel;
      }
      return false;
    }
    // Si es mención de usuario
    if (/^<@!?\d+>$/.test(arg)) {
      return false; // Ya lo capturamos con message.mentions.users.first()
    }
    // Si es un número (cantidad)
    if (!isNaN(Number(arg)) && amount === null) {
      amount = parseInt(arg, 10);
      return false;
    }
    return true;
  });

  // Si no se encontró un número explícito en los argumentos sueltos, revisamos si el último argumento era un número
  if (amount === null && args.length > 0) {
    const lastArg = args[args.length - 1];
    if (!isNaN(Number(lastArg))) {
      amount = parseInt(lastArg, 10);
    }
  }

  if (amount === null || amount <= 0) {
    await message.reply(
      "❌ Tenés que especificar una cantidad válida de mensajes a borrar (mayor a 0).",
    );
    return;
  }

  // Discord limita el bulkDelete a un máximo de 100 mensajes por tanda
  // Y sumamos 1 extra si el comando se ejecutó en el mismo canal para borrar el mensaje del propio usuario (-clear)
  const isSameChannel = targetChannel.id === message.channel.id;
  const fetchLimit = targetUser ? 100 : Math.min(amount + (isSameChannel ? 1 : 0), 100);

  try {
    // Intentar borrar primero el mensaje del comando si están en el mismo canal
    if (isSameChannel) {
      await message.delete().catch(() => {});
    }

    const fetchedMessages = await targetChannel.messages.fetch({
      limit: fetchLimit,
    });

    let messagesToDelete = Array.from(fetchedMessages.values());

    // Si se especificó un usuario, filtramos los mensajes de ese usuario
    if (targetUser) {
      messagesToDelete = messagesToDelete.filter(
        (msg) => msg.author.id === targetUser.id,
      );
      // Limitamos a la cantidad solicitada
      messagesToDelete = messagesToDelete.slice(0, amount);
    } else {
      // Si no hay usuario, limitamos directamente a la cantidad pedida
      messagesToDelete = messagesToDelete.slice(0, amount);
    }

    if (messagesToDelete.length === 0) {
      const reply = await targetChannel.send(
        `⚠️ No se encontraron mensajes${targetUser ? ` de <@${targetUser.id}>` : ""} para borrar en este rango.`,
      );
      setTimeout(() => reply.delete().catch(() => {}), 5000);
      return;
    }

    // Borrado masivo
    const deleted = await targetChannel.bulkDelete(messagesToDelete, true);

    const confirmationMsg = await targetChannel.send(
      `✅ Se borraron correctamente **${deleted.size}** mensaje${deleted.size === 1 ? "" : "s"}${targetUser ? ` de <@${targetUser.id}>` : ""}.`,
    );

    // Auto-eliminar el mensaje de confirmación después de 4 segundos para que no ensucie el chat
    setTimeout(() => {
      confirmationMsg.delete().catch(() => {});
    }, 4000);

    logger.info(
      {
        guildId: message.guild.id,
        channelId: targetChannel.id,
        moderatorId: message.author.id,
        targetUserId: targetUser?.id,
        deletedCount: deleted.size,
      },
      "Comando -clear ejecutado exitosamente.",
    );
  } catch (err: any) {
    logger.error(
      {
        err,
        guildId: message.guild.id,
        channelId: targetChannel.id,
      },
      "Error al ejecutar el comando -clear.",
    );

    const errorReply = await targetChannel.send(
      `❌ Ocurrió un error al intentar borrar los mensajes. (Nota: Discord no permite borrar mensajes de más de 14 días de antigüedad de forma masiva).`,
    );
    setTimeout(() => errorReply.delete().catch(() => {}), 6000);
  }
}
