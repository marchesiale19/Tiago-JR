import { and, eq, inArray, lt } from "drizzle-orm";
import {
  db,
  staffHelpRequestsTable,
  staffHelpHistoryTable,
} from "@workspace/db";

import type { StaffHelpAction } from "./types";

type CreateRequestData = {
  guildId: string;
  channelId: string;
  requesterId: string;
  requestMessageId: string;
};

type ClaimRequestData = {
  requestId: number;
  assigneeId: string;
  claimMessageId?: string | null;
};

async function registerHistory(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  data: {
    requestId: number;
    actorId: string;
    action: StaffHelpAction;
    messageId?: string | null;
    previousAssigneeId?: string | null;
    newAssigneeId?: string | null;
    details?: string | null;
  },
): Promise<void> {
  await tx.insert(staffHelpHistoryTable).values({
    requestId: data.requestId,
    actorId: data.actorId,
    action: data.action,
    messageId: data.messageId ?? null,
    previousAssigneeId: data.previousAssigneeId ?? null,
    newAssigneeId: data.newAssigneeId ?? null,
    details: data.details ?? null,
  });
}

/**
 * Crea una solicitud.
 */
export async function createStaffHelpRequest(
  data: CreateRequestData,
) {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .insert(staffHelpRequestsTable)
      .values({
        ...data,
        status: "pending",
      })
      .returning();

    if (!request) {
      throw new Error("No se pudo crear la solicitud.");
    }

    await registerHistory(tx, {
      requestId: request.id,
      actorId: data.requesterId,
      action: "created",
      messageId: data.requestMessageId,
    });

    return request;
  });
}

/**
 * Busca una solicitud activa de un usuario.
 */
export async function getActiveStaffHelpRequest(
  guildId: string,
  requesterId: string,
) {
  const [request] = await db
    .select()
    .from(staffHelpRequestsTable)
    .where(
      and(
        eq(staffHelpRequestsTable.guildId, guildId),
        eq(staffHelpRequestsTable.requesterId, requesterId),
        inArray(staffHelpRequestsTable.status, [
          "pending",
          "in_progress",
        ]),
      ),
    )
    .limit(1);

  return request ?? null;
}

/**
 * Busca una solicitud en progreso asignada a un moderador específico.
 */
export async function getActiveStaffHelpRequestByAssignee(
  guildId: string,
  assigneeId: string,
) {
  const [request] = await db
    .select()
    .from(staffHelpRequestsTable)
    .where(
      and(
        eq(staffHelpRequestsTable.guildId, guildId),
        eq(staffHelpRequestsTable.assigneeId, assigneeId),
        eq(staffHelpRequestsTable.status, "in_progress"),
      ),
    )
    .limit(1);

  return request ?? null;
}

/**
 * Busca una solicitud por el ID de su mensaje original.
 */
export async function getStaffHelpRequestByMessage(
  requestMessageId: string,
) {
  const [request] = await db
    .select()
    .from(staffHelpRequestsTable)
    .where(eq(staffHelpRequestsTable.requestMessageId, requestMessageId))
    .limit(1);

  return request ?? null;
}

/**
 * Busca la solicitud pendiente más antigua en un canal específico.
 */
export async function getPendingStaffHelpRequestByChannel(
  guildId: string,
  channelId: string,
) {
  const [request] = await db
    .select()
    .from(staffHelpRequestsTable)
    .where(
      and(
        eq(staffHelpRequestsTable.guildId, guildId),
        eq(staffHelpRequestsTable.channelId, channelId),
        eq(staffHelpRequestsTable.status, "pending"),
      ),
    )
    .orderBy(staffHelpRequestsTable.createdAt)
    .limit(1);

  return request ?? null;
}

/**
 * Asigna una solicitud pendiente.
 * La actualización condicional garantiza que solo gane el primer responsable.
 */
export async function claimStaffHelpRequest(
  data: ClaimRequestData,
) {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .update(staffHelpRequestsTable)
      .set({
        status: "in_progress",
        assigneeId: data.assigneeId,
        claimMessageId: data.claimMessageId ?? null,
        claimedAt: new Date(),
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(staffHelpRequestsTable.id, data.requestId),
          eq(staffHelpRequestsTable.status, "pending"),
        ),
      )
      .returning();

    if (!request) {
      return null;
    }

    await registerHistory(tx, {
      requestId: request.id,
      actorId: data.assigneeId,
      action: "claimed",
      messageId: data.claimMessageId ?? null,
      newAssigneeId: data.assigneeId,
    });

    return request;
  });
}

/**
 * Registra actividad válida del responsable.
 */
export async function updateStaffHelpActivity(
  requestId: number,
  assigneeId: string,
  messageId: string,
) {
  return db.transaction(async (tx) => {
    const now = new Date();

    const [request] = await tx
      .update(staffHelpRequestsTable)
      .set({
        lastActivityAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(staffHelpRequestsTable.id, requestId),
          eq(staffHelpRequestsTable.assigneeId, assigneeId),
          eq(staffHelpRequestsTable.status, "in_progress"),
        ),
      )
      .returning();

    if (!request) {
      return null;
    }

    await registerHistory(tx, {
      requestId,
      actorId: assigneeId,
      action: "activity",
      messageId,
    });

    return request;
  });
}

/**
 * Finaliza una solicitud.
 */
export async function finishStaffHelpRequest(
  requestId: number,
  assigneeId: string,
  messageId: string,
) {
  return db.transaction(async (tx) => {
    const now = new Date();

    const [request] = await tx
      .update(staffHelpRequestsTable)
      .set({
        status: "completed",
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(staffHelpRequestsTable.id, requestId),
          eq(staffHelpRequestsTable.assigneeId, assigneeId),
          eq(staffHelpRequestsTable.status, "in_progress"),
        ),
      )
      .returning();

    if (!request) {
      return null;
    }

    await registerHistory(tx, {
      requestId,
      actorId: assigneeId,
      action: "completed",
      messageId,
    });

    return request;
  });
}

/**
 * Devuelve una solicitud a pendiente.
 */
export async function releaseStaffHelpRequest(
  requestId: number,
  actorId: string,
  action: "reassigned" | "abandoned",
  details?: string,
) {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(staffHelpRequestsTable)
      .where(
        and(
          eq(staffHelpRequestsTable.id, requestId),
          eq(staffHelpRequestsTable.status, "in_progress"),
        ),
      )
      .limit(1);

    if (!request) {
      return null;
    }

    const [updated] = await tx
      .update(staffHelpRequestsTable)
      .set({
        status: action === "abandoned" ? "abandoned" : "pending",
        assigneeId: null,
        claimMessageId: null,
        claimedAt: null,
        lastActivityAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(staffHelpRequestsTable.id, requestId),
          eq(staffHelpRequestsTable.status, "in_progress"),
        ),
      )
      .returning();

    if (!updated) {
      return null;
    }

    await registerHistory(tx, {
      requestId,
      actorId,
      action,
      previousAssigneeId: request.assigneeId,
      details,
    });

    return updated;
  });
}

/**
 * Abandona una solicitud que todavía está pendiente.
 */
export async function abandonPendingStaffHelpRequest(
  requestId: number,
  actorId: string,
  details?: string,
) {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .update(staffHelpRequestsTable)
      .set({
        status: "abandoned",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(staffHelpRequestsTable.id, requestId),
          eq(staffHelpRequestsTable.status, "pending"),
        ),
      )
      .returning();

    if (!request) {
      return null;
    }

    await registerHistory(tx, {
      requestId,
      actorId,
      action: "abandoned",
      details,
    });

    return request;
  });
}

/**
 * Obtiene solicitudes cuyo responsable superó el tiempo de inactividad.
 */
export async function getExpiredStaffHelpRequests(
  cutoff: Date,
) {
  return db
    .select()
    .from(staffHelpRequestsTable)
    .where(
      and(
        eq(staffHelpRequestsTable.status, "in_progress"),
        lt(staffHelpRequestsTable.lastActivityAt, cutoff),
      ),
    );
}
