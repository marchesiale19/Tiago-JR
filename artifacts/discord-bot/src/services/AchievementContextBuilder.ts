// ---------------------------------------------------------------------------
// AchievementContextBuilder — assembles AchievementContext for one player.
//
// Design:
//   • Fetches all required metrics in a single coordinated async operation.
//   • lifetimeStats uses the existing SeasonRepository path (unchanged).
//   • Advanced metrics (peakElo, winStreak) are fetched via Promise.allSettled
//     so a failure in either never blocks the legacy evaluation path.
//   • Failed advanced fetches default to 0 and are logged as warnings.
//
// Callers receive a fully populated AchievementContext every time, regardless
// of whether advanced metrics were available.
// ---------------------------------------------------------------------------

import { seasonRepository } from "../database/repositories/SeasonRepository";
import { matchRepository }  from "../database/repositories/MatchRepository";
import { logger }           from "../lib/logger";
import type { AchievementContext } from "./AchievementContext";

export class AchievementContextBuilder {
  /**
   * Build a complete AchievementContext for one player.
   *
   * Guarantees:
   *   • lifetimeStats is always populated (existing query path).
   *   • peakElo and winStreak default to 0 on any query failure; those
   *     failures are logged but never thrown.
   *
   * @param discordId Discord snowflake of the player to build context for.
   */
  async build(discordId: string): Promise<AchievementContext> {
    // Legacy metrics — must always succeed; throw propagates to caller.
    const lifetimeStats = await seasonRepository.getLifetimeStats(discordId);

    // Advanced metrics — fault-tolerant; failures yield safe defaults.
    const [peakEloResult, winStreakResult] = await Promise.allSettled([
      matchRepository.getPeakElo(discordId),
      matchRepository.getCurrentWinStreak(discordId),
    ]);

    if (peakEloResult.status === "rejected") {
      logger.warn(
        { err: peakEloResult.reason, discordId },
        "AchievementContextBuilder: peakElo query failed — defaulting to 0",
      );
    }

    if (winStreakResult.status === "rejected") {
      logger.warn(
        { err: winStreakResult.reason, discordId },
        "AchievementContextBuilder: winStreak query failed — defaulting to 0",
      );
    }

    return {
      discordId,
      lifetimeStats,
      peakElo:   peakEloResult.status   === "fulfilled" ? peakEloResult.value   : 0,
      winStreak: winStreakResult.status === "fulfilled" ? winStreakResult.value : 0,
    };
  }
}

export const achievementContextBuilder = new AchievementContextBuilder();
