// ---------------------------------------------------------------------------
// AchievementService — Orchestrates achievement evaluation and unlocks.
//
// Architecture:
//   • Delegates all persistence to AchievementRepository.
//   • Does NOT contain achievement rule/condition logic yet (Phase 6 foundation).
//   • Future phases will add evaluate() methods that inspect player stats and
//     call unlock() for each qualifying achievement.
//
// Separation of concerns:
//   Repository  → raw DB reads / writes
//   This service → evaluation orchestration, business rules (future)
// ---------------------------------------------------------------------------

import { achievementRepository } from "../database/repositories/AchievementRepository";
import type { Logro, LogroJugador } from "@workspace/db";

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

  // ── Unlock (infrastructure entry-point, rules added in future phases) ─────

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
    logroId: number,
    metadata?: Record<string, unknown>,
  ): Promise<LogroJugador> {
    return achievementRepository.unlock({ discordId, logroId, metadata: metadata ?? null });
  }
}

export const achievementService = new AchievementService();
