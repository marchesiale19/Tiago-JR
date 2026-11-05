
import {
  type Message,
  type GuildMember,
  type TextChannel,
} from "discord.js";

import { STAFF_HELP_CONFIG } from "./config";

import {
  canRequestStaffHelp,
} from "./permissions";

import {
  getActiveStaffHelpRequest,
  createStaffHelpRequest,
} from "./repository";

import {
  buildStaffHelpEmbed,
  buildStaffHelpMentions,
} from "./embeds";

/**
 * Procesa las solicitudes de asistencia.
 *
 * El usuario debe escribir "Necesito ayuda"
 * en el canal configurado.
 */
export async function handleStaffHelpRequest(
  message: Message,
): Promise<void> {
  if (!message.guild || message.author.bot) return;

  if (message.guild.id !== STAFF_HELP_CONFIG.guildId) return;

  if (message.channel.id !== STAFF_HELP_CONFIG.channelId) return;

  if (message.content.trim().toLowerCase() !== "necesito ayuda") {
    return;
  }

  const member = message.member as GuildMember | null;

  // Comprobar permisos del solicitante.
  if (!canRequestStaffHelp(member)) return;

  // Evitar solicitudes duplicadas.
  const existingRequest = await getActiveStaffHelpRequest(
    message.guild.id,
    message.author.id,
  );

  if (existingRequest) {
    await message.reply(
      "Ya tenés una solicitud de asistencia pendiente o en atención.",
    );
    return;
  }

  const channel = message.channel as TextChannel;

  let requestMessage: Message | null = null;

  try {
    // Publicar la solicitud en el canal.
    requestMessage = await channel.send({
      content: buildStaffHelpMentions(),
      allowedMentions: {
        roles: [...STAFF_HELP_CONFIG.assigneeRoleIds],
        users: [],
      },
      embeds: [
        buildStaffHelpEmbed({
          requesterId: message.author.id,
          assigneeId: null,
          status: "pending",
        }),
      ],
    });

    // Registrar la solicitud en la base de datos.
    await createStaffHelpRequest({
      guildId: message.guild.id,
      channelId: channel.id,
      requesterId: message.author.id,
      requestMessageId: requestMessage.id,
    });

    console.log(
      `[StaffHelp] Nueva solicitud creada por ${message.author.tag}.`,
    );

  } catch (error) {
    // Evitar dejar un mensaje sin registrar en la base de datos.
    if (requestMessage) {
      await requestMessage.delete().catch(() => null);
    }

    console.error(
      "[StaffHelp] Error creando solicitud:",
      error,
    );

    await message.reply(
      "No se pudo registrar tu solicitud de asistencia. Intentá nuevamente.",
    ).catch(() => null);
  }
}
