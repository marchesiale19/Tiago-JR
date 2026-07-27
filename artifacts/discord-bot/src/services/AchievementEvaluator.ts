// ---------------------------------------------------------------------------
// AchievementEvaluator — Stateless evaluation layer.
//
// Architecture (Phase 7.4):
//   AchievementService
//     └─> AchievementEvaluator
//           ├─> AchievementContextBuilder   (single async context build)
//           │     ├─> SeasonRepository      (lifetime stats — legacy path)
//           │     └─> MatchRepository       (peakElo, winStreak — advanced)
//           └─> AchievementConditionRegistry (tipo → handler dispatch)
//
// Phase 7.4 changes vs. Phase 6:
//   • Internal `fetchMetrics` replaced by `AchievementContextBuilder.build()`.
//     The context is fetched once per `evaluate()` call (same number of round
//     trips for legacy tipos; new data is fetched in parallel via allSettled).
//   • Hard-coded switch replaced by `CONDITION_REGISTRY` lookup.
//   • Per-handler try/catch provides fault isolation: an advanced condition
//     failure marks only that achievement as unsupported; other achievements
//     in the same batch continue unaffected.
//   • Structured log emitted on any condition handler error (7.4.7).
//
// Backward compatibility guarantee:
//   • Public API (evaluate signature, EvaluationResult shape) is unchanged.
//   • Legacy tipos VICTORIAS / PARTIDAS / MVP produce identical results.
//   • Unknown tipos still return { unsupported: true, eligible: false }.
//   • Failure of advanced metric fetches never blocks legacy evaluation.
// ---------------------------------------------------------------------------

import type { Logro } from "@workspace/db";
import { logger }     from "../lib/logger";
import { achievementContextBuilder } from "./AchievementContextBuilder";
import { CONDITION_REGISTRY }        from "./AchievementConditionRegistry";

// ── Result type (public, re-exported by AchievementService) ─────────────────

export interface EvaluationResult {
  /** PK of the `logros` row that was evaluated. */
  achievementId: number;
  /** true when the condition is satisfied */
  eligible:      boolean;
  /** The player's current metric value for this achievement type. */
  currentValue:  number;
  /** The threshold required to unlock (achievement.valor). */
  requiredValue: number;
  /**
   * Set to true when the achievement tipo has no registered handler, or when
   * a handler threw an error during evaluation.
   * eligible will always be false in this case.
   */
  unsupported?:  true;
}

// ── Evaluator ────────────────────────────────────────────────────────────────

export class AchievementEvaluator {
  /**
   * Evaluate a list of achievements for one player.
   *
   * Builds a full AchievementContext once via AchievementContextBuilder, then
   * dispatches each achievement to its registered condition handler.
   *
   * Fault isolation (7.4.6):
   *   • Advanced metric failures in the context builder default to 0 and are
   *     logged — they never prevent legacy evaluation.
   *   • Per-handler exceptions are caught individually; the affected
   *     achievement is marked unsupported while all others proceed normally.
   *
   * @param discordId   Discord snowflake of the player to evaluate.
   * @param achievements List of active `Logro` rows from the catalog.
   * @returns One `EvaluationResult` per achievement, in input order.
   */
  async evaluate(
    discordId:    string,
    achievements: Logro[],
  ): Promise<EvaluationResult[]> {
    if (achievements.length === 0) return [];

    // Build context once; advanced metric failures are handled inside the builder.
    const context = await achievementContextBuilder.build(discordId);

    return achievements.map((logro): EvaluationResult => {
      const handler = CONDITION_REGISTRY.get(logro.tipo);

      // Unknown tipo — preserve legacy unsupported behaviour
      if (!handler) {
        return {
          achievementId: logro.id,
          eligible:      false,
          currentValue:  0,
          requiredValue: logro.valor,
          unsupported:   true,
        };
      }

      // Per-handler fault isolation — satisfies 7.4.6 & 7.4.7
      try {
        return handler(logro, context);
      } catch (err) {
        // Structured log: achievement id, condition type, player id, error (7.4.7)
        logger.warn(
          {
            err,
            achievementId: logro.id,
            conditionType: logro.tipo,
            discordId,
          },
          "AchievementEvaluator: condition handler threw — marking achievement unsupported",
        );
        return {
          achievementId: logro.id,
          eligible:      false,
          currentValue:  0,
          requiredValue: logro.valor,
          unsupported:   true,
        };
      }
    });
  }
}

export const achievementEvaluator = new AchievementEvaluator();
