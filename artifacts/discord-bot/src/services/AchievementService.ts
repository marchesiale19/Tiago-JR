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

// ── Summary type (consumed by the presentation layer) ────────────────────────

export interface AchievementSummaryItem {
  achievementId: number;
  codigo:        string;
  nombre:        string;
  descripcion:   string;
  /** Whether the player has already unlocked this achievement. */
  unlocked:      boolean;
  /** Player's current metric value for this achievement type. */
  currentValue:  number;
  /** Threshold required to unlock (achievement.valor). */
  requiredValue: number;
  /** True when achievement.tipo is not handled by the evaluator. */
  unsupported:   boolean;
}

export class AchievementService {
  // ── Catalog queries ───────────────────────────────────────────────────────

  /** Return all active achievements from the catalog. */
  async getActiveAchievements(): Promise<Logro[]> {
    return achievementRepository.listActive();
  }

  // ── Player summary (presentation layer entry-point) ───────────────────────

  /**
   * Aggregate the full achievement picture for one player.
   *
   * Returns one `AchievementSummaryItem` per active achievement containing:
   *   • catalog metadata (nombre, descripcion)
   *   • unlock status (whether the player already has it)
   *   • progress values (currentValue / requiredValue) from the evaluator
   *
   * The command layer must call only this method — no direct repo or evaluator
   * access from commands.
   *
   * @param discordId Discord snowflake of the player to summarise.
   */
  async getPlayerAchievementSummary(discordId: string): Promise<AchievementSummaryItem[]> {
    // Fetch catalog and unlock list in parallel
    const [activeAchievements, unlocked] = await Promise.all([
      achievementRepository.listActive(),
      achievementRepository.listByPlayer(discordId),
    ]);

    if (activeAchievements.length === 0) return [];

    const unlockedIds = new Set(unlocked.map((u) => u.logroId));

    // Evaluate for progress values (currentValue) across the full catalog
    const results    = await achievementEvaluator.evaluate(discordId, activeAchievements);
    const resultMap  = new Map(results.map((r) => [r.achievementId, r]));

    return activeAchievements.map((logro): AchievementSummaryItem => {
      const result = resultMap.get(logro.id);
      return {
        achievementId: logro.id,
        codigo:        logro.codigo,
        nombre:        logro.nombre,
        descripcion:   logro.descripcion,
        unlocked:      unlockedIds.has(logro.id),
        currentValue:  result?.currentValue  ?? 0,
        requiredValue: result?.requiredValue ?? logro.valor,
        unsupported:   result?.unsupported   === true,
      };
    });
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
