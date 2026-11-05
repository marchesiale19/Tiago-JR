
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
 console.log(
  `[StaffHelp] Mensaje recibido | Autor: ${message.author.tag} | Guild: ${message.guild?.id ?? "DM"} | Canal: ${message.channel.id} | Contenido: ${JSON.stringify(message.content)}`,
);

if (!message.guild || message.author.bot) {
  console.log("[StaffHelp] DESCARTADO: mensaje privado o autor bot.");
  return;
}

if (message.guild.id !== STAFF_HELP_CONFIG.guildId) {
  console.log(
    `[StaffHelp] DESCARTADO: servidor incorrecto (${message.guild.id}).`,
  );
  return;
}

if (message.channel.id !== STAFF_HELP_CONFIG.channelId) {
  console.log(
    `[StaffHelp] DESCARTADO: canal incorrecto (${message.channel.id}).`,
  );
  return;
}

if (message.content.trim().toLowerCase() !== "necesito ayuda") {
  console.log(
    `[StaffHelp] DESCARTADO: contenido diferente (${JSON.stringify(message.content)}).`,
  );
  return;
}

console.log("[StaffHelp] Mensaje válido. Comprobando permisos...");

 const member = message.member as GuildMember | null;

console.log(
  `[StaffHelp] Miembro: ${member ? "encontrado" : "no encontrado"} | Roles: ${member ? [...member.roles.cache.keys()].join(", ") : "ninguno"}`,
);

// Comprobar permisos del solicitante.
if (!canRequestStaffHelp(member)) {
  console.log("[StaffHelp] DESCARTADO: usuario sin permisos.");
  return;
}

console.log("[StaffHelp] Permisos correctos. Comprobando solicitudes existentes...");
console.log("[StaffHelp] Consultando solicitudes activas en PostgreSQL...");
  // Evitar solicitudes duplicadas.
  const existingRequest = await getActiveStaffHelpRequest(
    message.guild.id,
    message.author.id,
  );
console.log(
  `[StaffHelp] Solicitud existente: ${existingRequest ? "sí" : "no"}.`,
);
  if (existingRequest) {
    await message.reply(
      "Ya tenés una solicitud de asistencia pendiente o en atención.",
    );
    return;
  }

  const channel = message.channel as TextChannel;

  let requestMessage: Message | null = null;
console.log("[StaffHelp] Preparando publicación de la solicitud...");
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
