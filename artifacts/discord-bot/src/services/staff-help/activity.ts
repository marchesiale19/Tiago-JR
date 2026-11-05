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
  getPendingStaffHelpRequestByChannel,
  getActiveStaffHelpRequest,
  getActiveStaffHelpRequestByAssignee,
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

  const content = message.content.trim().toLowerCase();

  if (!content) return;

  const member = message.member as GuildMember | null;

  // 1. SI ESCRIBEN "HOLA": Reclamar la solicitud pendiente más antigua del canal.
  if (content === "hola") {
    if (!canHandleStaffHelp(member)) return;

    const request = await getPendingStaffHelpRequestByChannel(
      message.guild.id,
      message.channel.id,
    );

    if (!request) return;

    if (message.author.id === request.requesterId) return;

    const claimed = await claimStaffHelpRequest({
      requestId: request.id,
      assigneeId: message.author.id,
      claimMessageId: message.id,
    });

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

// 2. SI ESCRIBEN "LISTO": Buscar la solicitud activa asignada a este moderador en el canal.
  if (content === "listo") {
    if (!canHandleStaffHelp(member)) return;

    const request = await getActiveStaffHelpRequestByAssignee(
      message.guild.id,
      message.author.id,
    );

    if (
      !request ||
      request.channelId !== message.channel.id ||
      request.status !== "in_progress" ||
      request.assigneeId !== message.author.id
    ) {
      return;
    }

    const finished = await finishStaffHelpRequest(
      request.id,
      message.author.id,
      message.id,
    );

    if (!finished) return;

    try {
      await message.react("✅");
    } catch {
      // La finalización no depende de que se pueda añadir la reacción.
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
        "completed",
      );
    }

    return;
  }

 // 3. OTRAS MENSUALES EN ATENCIÓN: Si manda cualquier otro mensaje en el canal durante la atención.
  const activeRequest = await getActiveStaffHelpRequestByAssignee(
    message.guild.id,
    message.author.id,
  );

  if (
    activeRequest &&
    activeRequest.channelId === message.channel.id &&
    activeRequest.status === "in_progress" &&
    activeRequest.assigneeId === message.author.id
  ) {
    await updateStaffHelpActivity(
      activeRequest.id,
      message.author.id,
      message.id,
    );
  }
}
