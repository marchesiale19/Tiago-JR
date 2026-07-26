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

  // ── Evaluate + unlock (batch, post-match) ────────────────────────────────

  /**
   * Evaluate all active achievements for each player in `discordIds` and
   * record any newly eligible unlocks.
   *
   * Design:
   *   • Fetches the active catalog once and reuses it across all players.
   *   • Per player: loads already-unlocked IDs and skips those achievements
   *     to avoid redundant DB writes.
   *   • Evaluates only the remaining (not-yet-unlocked) achievements.
   *   • Calls AchievementRepository.unlock() for every eligible result.
   *   • Returns void — intended to be called fire-and-forget by the caller.
   *
   * Responsibility boundary: this method knows nothing about matches, lobbies,
   * or ELO. The caller is responsible for resolving which discordIds to pass.
   */
  async evaluateAndUnlockForPlayers(discordIds: string[]): Promise<void> {
    if (discordIds.length === 0) return;

    // Fetch catalog once; share across all players in this batch
    const activeAchievements = await achievementRepository.listActive();
    if (activeAchievements.length === 0) return;

    for (const discordId of discordIds) {
      // Skip achievements already unlocked by this player
      const unlocked    = await achievementRepository.listByPlayer(discordId);
      const unlockedIds = new Set(unlocked.map((u) => u.logroId));
      const pending     = activeAchievements.filter((a) => !unlockedIds.has(a.id));
      if (pending.length === 0) continue;

      // Evaluate eligibility
      const results = await achievementEvaluator.evaluate(discordId, pending);

      // Record every newly eligible unlock
      for (const result of results) {
        if (result.eligible && !result.unsupported) {
          await achievementRepository.unlock({
            discordId,
            logroId:  result.achievementId,
            metadata: null,
          });
        }
      }
    }
  }

  // ── Unlock (single-record entry-point) ────────────────────────────────────

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
