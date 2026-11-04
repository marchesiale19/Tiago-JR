import {
  Client,
  type TextChannel,
} from "discord.js";

import { STAFF_HELP_CONFIG } from "./config";
import { getExpiredStaffHelpRequests, releaseStaffHelpRequest } from "./repository";
import { buildStaffHelpEmbed } from "./embeds";

let workerInterval: ReturnType<typeof setInterval> | null = null;
let workerRunning = false;

/**
 * Comprueba las solicitudes que superaron el tiempo de inactividad.
 */
export async function processExpiredStaffHelpRequests(
  client: Client,
): Promise<void> {
  if (workerRunning) return;

  workerRunning = true;

  try {
    const cutoff = new Date(
      Date.now() - STAFF_HELP_CONFIG.timeoutMs,
    );

    const expiredRequests = await getExpiredStaffHelpRequests(cutoff);

    for (const request of expiredRequests) {
      const released = await releaseStaffHelpRequest(
        request.id,
        client.user?.id ?? "system",
        "reassigned",
        "Solicitud liberada automáticamente por superar los cinco minutos de inactividad.",
      );

      if (!released) continue;

      try {
        const channel = await client.channels.fetch(
          request.channelId,
        );

        if (!channel || !channel.isTextBased() || !("messages" in channel)) {
          continue;
        }

        const textChannel = channel as TextChannel;

        const originalMessage = await textChannel.messages.fetch(
          request.requestMessageId,
        );

        await originalMessage.edit({
          embeds: [
            buildStaffHelpEmbed({
              requesterId: request.requesterId,
              assigneeId: null,
              status: "pending",
            }).setDescription(
              "La solicitud ha quedado nuevamente disponible porque el responsable anterior superó el tiempo de inactividad.\n\n" +
              "Para tomarla, un responsable autorizado debe responder **Hola** a este mensaje.",
            ),
          ],
        });
      } catch (error) {
        console.error(
          `[StaffHelp] No se pudo actualizar la solicitud ${request.id}:`,
          error,
        );
      }
    }
  } catch (error) {
    console.error(
      "[StaffHelp] Error procesando solicitudes vencidas:",
      error,
    );
  } finally {
    workerRunning = false;
  }
}

/**
 * Inicia el trabajador automático.
 */
export function startStaffHelpTimeoutWorker(
  client: Client,
): void {
  if (workerInterval) return;

  void processExpiredStaffHelpRequests(client);

  workerInterval = setInterval(() => {
    void processExpiredStaffHelpRequests(client);
  }, STAFF_HELP_CONFIG.workerIntervalMs);

  console.log("[StaffHelp] Sistema de inactividad iniciado.");
}

/**
 * Detiene el trabajador automático.
 */
export function stopStaffHelpTimeoutWorker(): void {
  if (!workerInterval) return;

  clearInterval(workerInterval);
  workerInterval = null;

  console.log("[StaffHelp] Sistema de inactividad detenido.");
}
