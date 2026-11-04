import {
  type Message,
  type GuildMember,
  type TextChannel,
} from "discord.js";

import { STAFF_HELP_CONFIG } from "./config";
import {
  canHandleStaffHelp,
} from "./permissions";

import {
  getStaffHelpRequestByMessage,
  claimStaffHelpRequest,
  updateStaffHelpActivity,
  finishStaffHelpRequest,
} from "./repository";

import {
  buildStaffHelpEmbed,
} from "./embeds";

async function updateOriginalEmbed(
  message: Message,
  requesterId: string,
  assigneeId: string | null,
  status: "pending" | "in_progress" | "completed" | "abandoned",
): Promise<void> {
  await message.edit({
    embeds: [
      buildStaffHelpEmbed({
        requesterId,
        assigneeId,
        status,
      }),
    ],
  });
}

async function getOriginalRequestMessage(
  message: Message,
  requestMessageId: string,
): Promise<Message | null> {
  try {
    const channel = message.channel as TextChannel;

    return await channel.messages.fetch(requestMessageId);
  } catch {
    return null;
  }
}

/**
 * Procesa las respuestas relacionadas con una solicitud de asistencia.
 */
export async function handleStaffHelpActivity(
  message: Message,
): Promise<void> {
  if (!message.guild || message.author.bot) return;

  if (message.guild.id !== STAFF_HELP_CONFIG.guildId) return;

  if (message.channel.id !== STAFF_HELP_CONFIG.channelId) return;

  // Todas las interacciones deben responder al mensaje original del bot.
  const referenceId = message.reference?.messageId;

  if (!referenceId) return;

  const request = await getStaffHelpRequestByMessage(referenceId);

  if (!request) return;

  if (
    request.guildId !== message.guild.id ||
    request.channelId !== message.channel.id
  ) {
    return;
  }

  if (
    request.status === "completed" ||
    request.status === "abandoned"
  ) {
    return;
  }

  const content = message.content.trim().toLowerCase();

  if (!content) return;

  const member = message.member as GuildMember | null;

  // Una solicitud pendiente solamente puede ser reclamada con "Hola".
  if (request.status === "pending") {
    if (content !== "hola") return;

    if (!canHandleStaffHelp(member)) return;

    // El solicitante no puede asignarse su propia solicitud.
    if (message.author.id === request.requesterId) return;

    const claimed = await claimStaffHelpRequest({
      requestId: request.id,
      assigneeId: message.author.id,
      claimMessageId: message.id,
    });

    // Otro responsable pudo reclamarla primero.
    if (!claimed) return;

    try {
      await message.react("✅");
    } catch {
      // La asignación no depende de que se pueda añadir la reacción.
    }

    const original = await getOriginalRequestMessage(
      message,
      request.requestMessageId,
    );

    if (original) {
      await updateOriginalEmbed(
        original,
        request.requesterId,
        message.author.id,
        "in_progress",
      );
    }

    return;
  }

  // A partir de aquí, la solicitud está en atención.
  if (request.status !== "in_progress") return;

  // Solamente el responsable asignado puede continuar la conversación.
  if (request.assigneeId !== message.author.id) return;

  // Finalización mediante "Listo".
  if (content === "listo") {
    const finished = await finishStaffHelpRequest(
      request.id,
      message.author.id,
      message.id,
    );

    if (!finished) return;

    const original = await getOriginalRequestMessage(
      message,
      request.requestMessageId,
    );

    if (original) {
      await updateOriginalEmbed(
        original,
        request.requesterId,
        message.author.id,
        "completed",
      );
    }

    return;
  }

  // Cualquier otra respuesta válida del responsable actualiza su actividad.
  await updateStaffHelpActivity(
    request.id,
    message.author.id,
    message.id,
  );
}
