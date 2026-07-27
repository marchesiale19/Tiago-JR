// ---------------------------------------------------------------------------
// AchievementConditionRegistry — extensible map of achievement tipo → handler.
//
// Architecture:
//   Each handler is a pure synchronous function:
//     (logro: Logro, context: AchievementContext) => EvaluationResult
//   All async work happens in AchievementContextBuilder before handlers run.
//
// Adding a new condition type:
//   1. Add the new `tipo` string to NEW_CONDITION_TIPOS (for documentation).
//   2. Call `makeThresholdHandler` with a selector that reads the needed
//      field from AchievementContext, or write a custom handler directly.
//   3. Register it in CONDITION_REGISTRY below.
//   4. Add the corresponding field to AchievementContext + its builder query
//      if the metric does not already exist in the context.
//
// Backward compatibility guarantee:
//   Legacy tipos (VICTORIAS, PARTIDAS, MVP) use the identical comparator
//   (currentValue >= logro.valor) as the original evaluator switch statement.
//   Their handlers only read from lifetimeStats, which is always populated.
// ---------------------------------------------------------------------------

import type { Logro } from "@workspace/db";
import type { AchievementContext } from "./AchievementContext";
import type { EvaluationResult }   from "./AchievementEvaluator";

// ── Handler type ─────────────────────────────────────────────────────────────

/**
 * A condition handler receives the full achievement catalog row and the
 * prepared player context, and returns a structured evaluation result.
 * Handlers must be synchronous and must not perform DB queries.
 */
export type ConditionHandler = (
  logro:   Logro,
  context: AchievementContext,
) => EvaluationResult;

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a threshold handler for the common pattern:
 *   currentValue = selector(context)
 *   eligible     = currentValue >= logro.valor
 */
function makeThresholdHandler(
  selector: (ctx: AchievementContext) => number,
): ConditionHandler {
  return (logro, ctx): EvaluationResult => {
    const currentValue = selector(ctx);
    return {
      achievementId: logro.id,
      eligible:      currentValue >= logro.valor,
      currentValue,
      requiredValue: logro.valor,
    };
  };
}

// ── Registry ─────────────────────────────────────────────────────────────────

/**
 * Central registry mapping `logros.tipo` strings to their condition handlers.
 *
 * Legacy tipos (VICTORIAS, PARTIDAS, MVP) are registered first and preserve
 * identical behaviour to the original switch-based evaluator.
 *
 * Advanced tipos (WIN_STREAK, ELO_PEAK) are registered below them and are
 * opt-in — existing Logro rows without these tipos are unaffected.
 */
export const CONDITION_REGISTRY = new Map<string, ConditionHandler>([
  // ── Legacy conditions (Phase 6) ──────────────────────────────────────────
  ["VICTORIAS",  makeThresholdHandler((ctx) => ctx.lifetimeStats.victorias)],
  ["PARTIDAS",   makeThresholdHandler((ctx) => ctx.lifetimeStats.partidasJugadas)],
  ["MVP",        makeThresholdHandler((ctx) => ctx.lifetimeStats.mvpCount)],

  // ── Advanced conditions (Phase 7.4) ──────────────────────────────────────

  /**
   * WIN_STREAK — unlock when the player's current consecutive-victory streak
   * reaches `logro.valor` wins.
   * Example: valor=5 unlocks after 5 wins in a row.
   */
  ["WIN_STREAK", makeThresholdHandler((ctx) => ctx.winStreak)],

  /**
   * ELO_PEAK — unlock when the player has ever reached `logro.valor` ELO,
   * evaluated against the all-time peak rather than the current (volatile) ELO.
   * Example: valor=1500 unlocks once the player has touched 1500 ELO at any point.
   */
  ["ELO_PEAK",   makeThresholdHandler((ctx) => ctx.peakElo)],
]);
