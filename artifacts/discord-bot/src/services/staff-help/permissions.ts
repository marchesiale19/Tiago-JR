
import type { GuildMember } from "discord.js";

import { STAFF_HELP_CONFIG } from "./config";

/**
 * Comprueba si un miembro tiene alguno de los roles indicados.
 */
function hasAnyRole(
  member: GuildMember | null,
  roleIds: readonly string[],
): boolean {
  if (!member) return false;

  return member.roles.cache.some((role) =>
    roleIds.includes(role.id),
  );
}

/**
 * Comprueba si un miembro puede solicitar asistencia.
 */
export function canRequestStaffHelp(
  member: GuildMember | null,
): boolean {
  return hasAnyRole(
    member,
    STAFF_HELP_CONFIG.requesterRoleIds,
  );
}

/**
 * Comprueba si un miembro puede atender solicitudes.
 */
export function canHandleStaffHelp(
  member: GuildMember | null,
): boolean {
  return hasAnyRole(
    member,
    STAFF_HELP_CONFIG.assigneeRoleIds,
  );
}
