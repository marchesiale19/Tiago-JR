// ---------------------------------------------------------------------------
// AchievementEvaluator — Stateless evaluation layer.
//
// Architecture:
//   AchievementService
//     └─> AchievementEvaluator
//           ├─ reads player metrics via SeasonRepository / MatchRepository
//           ├─ compares against achievement definitions (tipo + valor)
//           └─ returns structured EvaluationResult[]
//
// Rules:
//   • No DB calls directly — only through the three permitted repositories.
//   • No achievement-specific hardcoding — driven purely by `tipo` + `valor`.
//   • Unknown `tipo` values yield { unsupported: true } — never silent failures.
//   • Does NOT call AchievementRepository.unlock() — unlock belongs to future phases.
// ---------------------------------------------------------------------------

import { seasonRepository } from "../database/repositories/SeasonRepository";
import type { Logro } from "@workspace/db";

// ── Result type ──────────────────────────────────────────────────────────────

export interface EvaluationResult {
  /** PK of the `logros` row that was evaluated. */
  achievementId: number;
  /** true when playerMetric >= achievement.valor */
  eligible:      boolean;
  /** The player's current metric value for this achievement type. */
  currentValue:  number;
  /** The threshold required to unlock (achievement.valor). */
  requiredValue: number;
  /**
   * Set to true when achievement.tipo is not recognised by the evaluator.
   * eligible will always be false in this case.
   */
  unsupported?:  true;
}

// ── Supported metric types ───────────────────────────────────────────────────

const SUPPORTED_TIPOS = ["VICTORIAS", "PARTIDAS", "MVP"] as const;
type SupportedTipo = (typeof SUPPORTED_TIPOS)[number];

function isSupportedTipo(tipo: string): tipo is SupportedTipo {
  return (SUPPORTED_TIPOS as readonly string[]).includes(tipo);
}

// ── Player metric snapshot (fetched once per evaluation call) ─────────────────

interface PlayerMetrics {
  victorias:       number;
  partidasJugadas: number;
  mvpCount:        number;
}

async function fetchMetrics(discordId: string): Promise<PlayerMetrics> {
  return seasonRepository.getLifetimeStats(discordId);
}

function resolveMetric(metrics: PlayerMetrics, tipo: SupportedTipo): number {
  switch (tipo) {
    case "VICTORIAS": return metrics.victorias;
    case "PARTIDAS":  return metrics.partidasJugadas;
    case "MVP":       return metrics.mvpCount;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export class AchievementEvaluator {
  /**
   * Evaluate a list of achievements for one player.
   *
   * Fetches the player's lifetime metrics once, then evaluates every
   * achievement against the generic rule: playerMetric >= achievement.valor.
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

    const metrics = await fetchMetrics(discordId);

    return achievements.map((logro): EvaluationResult => {
      if (!isSupportedTipo(logro.tipo)) {
        return {
          achievementId: logro.id,
          eligible:      false,
          currentValue:  0,
          requiredValue: logro.valor,
          unsupported:   true,
        };
      }

      const currentValue = resolveMetric(metrics, logro.tipo);

      return {
        achievementId: logro.id,
        eligible:      currentValue >= logro.valor,
        currentValue,
        requiredValue: logro.valor,
      };
    });
  }
}

export const achievementEvaluator = new AchievementEvaluator();
