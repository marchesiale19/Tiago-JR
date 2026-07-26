// ---------------------------------------------------------------------------
// AchievementService — Orchestrates achievement evaluation and unlocks.
//
// Architecture:
//   AchievementService
//     ├─> AchievementRepository  (catalog reads, unlock writes)
//     └─> AchievementEvaluator   (eligibility evaluation against player metrics)
//
// Separation of concerns:
//   Repository       → raw DB reads / writes
//   AchievementEvaluator → metric fetching + eligibility logic
//   This service     → public API; coordinates evaluator + repository
// ---------------------------------------------------------------------------

import { achievementRepository } from "../database/repositories/AchievementRepository";
import { achievementEvaluator, type EvaluationResult } from "./AchievementEvaluator";
import type { Logro, LogroJugador } from "@workspace/db";

export type { EvaluationResult };

export class AchievementService {
  // ── Catalog queries ───────────────────────────────────────────────────────

  /** Return all active achievements from the catalog. */
  async getActiveAchievements(): Promise<Logro[]> {
    return achievementRepository.listActive();
  }

  // ── Player queries ────────────────────────────────────────────────────────

  /** Return all achievements already unlocked by a player. */
  async getPlayerAchievements(discordId: string): Promise<LogroJugador[]> {
    return achievementRepository.listByPlayer(discordId);
  }

  // ── Evaluation ────────────────────────────────────────────────────────────

  /**
   * Evaluate all active achievements for a player and return structured results.
   *
   * Does NOT unlock anything — eligibility only.
   * Unlock orchestration belongs to future phases.
   *
   * @param discordId Discord snowflake of the player to evaluate.
   * @returns One EvaluationResult per active achievement.
   */
  async evaluatePlayer(discordId: string): Promise<EvaluationResult[]> {
    const achievements = await achievementRepository.listActive();
    return achievementEvaluator.evaluate(discordId, achievements);
  }

  /**
   * Evaluate a specific subset of achievements for a player.
   * Useful when only a known set of types need checking (e.g. after a match).
   *
   * Does NOT unlock anything — eligibility only.
   */
  async evaluatePlayerForAchievements(
    discordId:    string,
    achievements: Logro[],
  ): Promise<EvaluationResult[]> {
    return achievementEvaluator.evaluate(discordId, achievements);
  }

  // ── Unlock (entry-point; orchestration rules added in future phases) ───────

  /**
   * Attempt to unlock a single achievement for a player.
   * Idempotent — safe to call even if already unlocked.
   *
   * @param discordId  Discord snowflake of the player.
   * @param logroId    PK of the achievement in the `logros` catalog.
   * @param metadata   Optional context stored alongside the unlock record.
   * @returns The unlock record (existing or newly created).
   */
  async unlock(
    discordId: string,
    logroId:   number,
    metadata?: Record<string, unknown>,
  ): Promise<LogroJugador> {
    return achievementRepository.unlock({ discordId, logroId, metadata: metadata ?? null });
  }
}

export const achievementService = new AchievementService();
