// ---------------------------------------------------------------------------
// ProfileService — Aggregates player profile data for /perfil.
//
// Responsibilities:
//   • getPlayerProfile() — collect user record, season stats, leaderboard
//     position, ELO history, and recent match history for a given discordId.
//
// Architecture rules:
//   • No DB access — delegates entirely to repositories.
//   • No ELO calculation — EloService owns that.
//   • Winrate is NOT computed here; it is computed at render time in the command.
// ---------------------------------------------------------------------------

import { matchRepository }  from "../database/repositories/MatchRepository";
import { userRepository }   from "../database/repositories/UserRepository";
import { seasonRepository } from "../database/repositories/SeasonRepository";
import type { Usuario, EstadisticaTemporada, HistorialElo } from "@workspace/db";
import type { PlayerMatchSummary } from "../database/repositories/MatchRepository";

export interface PlayerProfile {
  /** Raw usuarios row; undefined if the player has never interacted with the bot. */
  user:                Usuario | undefined;
  /** Per-season aggregated stats for the currently active season. */
  seasonStats:         EstadisticaTemporada | undefined;
  /** Display name of the active season. */
  seasonName:          string | undefined;
  /** DB id of the active season (for scoping). */
  temporadaId:         number | undefined;
  /** 1-based rank in the active season leaderboard; undefined if unranked. */
  leaderboardPosition: number | undefined;
  /** Up to 5 most recent ELO change events. */
  eloHistory:          HistorialElo[];
  /** Up to 5 most recent partidas the player participated in. */
  recentMatches:       PlayerMatchSummary[];
}

/**
 * Collect all data required to render a player's /perfil embed.
 * All queries run independently; no writes occur.
 */
export async function getPlayerProfile(discordId: string): Promise<PlayerProfile> {
  // 1. User record (global ELO, status)
  const user = await userRepository.findByDiscordId(discordId);

  // 2. Active season
  const season = await seasonRepository.findActive();

  // 3. Season-scoped stats + leaderboard position
  let seasonStats:         EstadisticaTemporada | undefined;
  let leaderboardPosition: number | undefined;

  if (season) {
    seasonStats = await seasonRepository.findStats(discordId, season.id);

    if (seasonStats) {
      // Reuse existing leaderboard query (max 500 rows) to find rank
      const board = await seasonRepository.leaderboard(season.id, 500);
      const idx   = board.findIndex((r) => r.discordId === discordId);
      if (idx !== -1) leaderboardPosition = idx + 1;
    }
  }

  // 4. ELO history — last 5 entries
  const eloHistory = await matchRepository.listEloHistory(discordId, 5);

  // 5. Recent match history — last 5 partidas
  const recentMatches = await matchRepository.listByPlayer(discordId, 5);

  return {
    user,
    seasonStats,
    seasonName:          season?.nombre,
    temporadaId:         season?.id,
    leaderboardPosition,
    eloHistory,
    recentMatches,
  };
}
