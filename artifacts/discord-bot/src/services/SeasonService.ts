// ---------------------------------------------------------------------------
// SeasonService — Season lifecycle management.
//
// Responsibilities:
//   • openSeason()  — create a new season, auto-close the currently active one.
//   • closeSeason() — manually close a specific active season.
//
// Architecture rules:
//   • Business logic stays here — repositories only do persistence.
//   • Every state change produces an immutable audit entry.
//   • New season stats (estadisticas_temporada) start fresh per-season because
//     the table is keyed by (discordId, temporadaId) — no rows carry over.
//     Players' initial ELO in a new season is derived from DEFAULT_ELO (1200)
//     as the base for the first delta applied by closeMatchAtomic.
// ---------------------------------------------------------------------------

import { seasonRepository }    from "../database/repositories/SeasonRepository";
import { auditoriaRepository } from "../database/repositories/AuditoriaRepository";
import { AuditModulo }         from "../database/enums";
import type { Temporada }      from "@workspace/db";
import { logger }              from "../lib/logger";

export interface OpenSeasonResult {
  /** The season that was auto-closed, or null if none was active. */
  closed: Temporada | null;
  /** The newly created season. */
  opened: Temporada;
}

/**
 * Open a new competitive season.
 *
 * If a season is currently active it is automatically closed first
 * (activa = false, fecha_fin = now). The new season starts immediately.
 * Players' estadisticas_temporada rows are fresh per-season: no rows exist
 * for the new temporadaId until their first match fires closeMatchAtomic.
 */
export async function openSeason(
  nombre:  string,
  actorId: string,
): Promise<OpenSeasonResult> {
  // 1. Auto-close the currently active season if one exists
  const current = await seasonRepository.findActive();
  if (current) {
    await seasonRepository.close(current.id, new Date());
    await auditoriaRepository.log({
      modulo:       AuditModulo.Seasons,
      accion:       "season_auto_closed",
      realizadoPor: actorId,
      detalles:     {
        temporadaId:  current.id,
        nombre:       current.nombre,
        reason:       "new_season_opened",
      },
    });
    logger.info(
      { temporadaId: current.id, nombre: current.nombre },
      "Active season auto-closed when opening new season",
    );
  }

  // 2. Create new season (active from now)
  const newSeason = await seasonRepository.create({
    nombre,
    fechaInicio: new Date(),
    activa:      true,
  });

  await auditoriaRepository.log({
    modulo:       AuditModulo.Seasons,
    accion:       "season_opened",
    realizadoPor: actorId,
    detalles:     { temporadaId: newSeason.id, nombre: newSeason.nombre },
  });

  logger.info(
    { temporadaId: newSeason.id, nombre: newSeason.nombre },
    "New season opened",
  );

  return { closed: current ?? null, opened: newSeason };
}

/**
 * Manually close a specific active season.
 * Throws if the season does not exist or is already closed.
 */
export async function closeSeason(
  temporadaId: number,
  actorId:     string,
): Promise<Temporada> {
  const season = await seasonRepository.findById(temporadaId);
  if (!season)        throw new Error(`Temporada ${temporadaId} no encontrada.`);
  if (!season.activa) throw new Error(`La temporada "${season.nombre}" ya está cerrada.`);

  const fechaFin = new Date();
  await seasonRepository.close(temporadaId, fechaFin);

  await auditoriaRepository.log({
    modulo:       AuditModulo.Seasons,
    accion:       "season_closed",
    realizadoPor: actorId,
    detalles:     { temporadaId, nombre: season.nombre },
  });

  logger.info({ temporadaId, nombre: season.nombre }, "Season manually closed");
  return { ...season, activa: false, fechaFin };
}
