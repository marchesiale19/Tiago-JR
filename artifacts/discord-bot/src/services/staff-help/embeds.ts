import { EmbedBuilder } from "discord.js";
import { STAFF_HELP_CONFIG } from "./config";
import type { StaffHelpStatus } from "./types";

interface StaffHelpEmbedData {
  requesterId: string;
  assigneeId: string | null;
  status: StaffHelpStatus;
}

const STATUS_LABELS: Record<StaffHelpStatus, string> = {
  pending: "Pendiente de asignación",
  in_progress: "En atención",
  completed: "Finalizada",
  abandoned: "Cancelada",
};

function getResponsibleText(
  assigneeId: string | null,
): string {
  return assigneeId
    ? `<@${assigneeId}>`
    : "Responsable pendiente de asignación";
}

export function buildStaffHelpEmbed(
  data: StaffHelpEmbedData,
): EmbedBuilder {
  const isPending = data.status === "pending";

  return new EmbedBuilder()
    .setColor(
      data.status === "completed"
        ? 0x2ecc71
        : data.status === "abandoned"
          ? 0xe74c3c
          : isPending
            ? 0xf1c40f
            : 0x3498db,
    )
    .setTitle("📩 Solicitud de asistencia")
    .setDescription(
      "Un miembro del equipo ha solicitado asistencia del Staff.\n\n" +
      "Para tomar esta solicitud, un responsable autorizado debe responder **Hola** a este mensaje.\n" +
      "Toda la conversación debe mantenerse respondiendo directamente a este mensaje original.",
    )
    .addFields(
      {
        name: "Solicitante",
        value: `<@${data.requesterId}>`,
        inline: true,
      },
      {
        name: "Responsable",
        value: getResponsibleText(data.assigneeId),
        inline: true,
      },
      {
        name: "Estado",
        value: STATUS_LABELS[data.status],
        inline: false,
      },
    )
    .setFooter({
      text: "Tiago-JR • Sistema de asistencia",
    })
    .setTimestamp();
}

export function buildStaffHelpMentions(): string {
  return STAFF_HELP_CONFIG.assigneeRoleIds
    .map((roleId) => `<@&${roleId}>`)
    .join(" ");
}
