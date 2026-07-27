// ---------------------------------------------------------------------------
// AchievementContext — prepared data bag passed to condition evaluators.
//
// Built once per player per evaluation batch by AchievementContextBuilder.
// Contains every metric any current or future condition type might need.
//
// Rules:
//   • No DB access here — this is a plain data type.
//   • Fields must be safe defaults (0 / empty) when source data is absent.
//   • Add new fields here when new condition types require additional metrics;
//     existing condition handlers that don't read the new field are unaffected.
// ---------------------------------------------------------------------------

export interface LifetimeStats {
  victorias:       number;
  partidasJugadas: number;
  mvpCount:        number;
}

export interface AchievementContext {
  /** Discord snowflake of the player being evaluated. */
  discordId:    string;

  /** Lifetime totals summed across all seasons. */
  lifetimeStats: LifetimeStats;

  /**
   * Current consecutive-victory streak derived from `historial_elo`.
   * Resets to 0 on the first non-victory competitive event.
   * Defaults to 0 when no history exists or when the query fails.
   */
  winStreak: number;

  /**
   * Highest `elo_nuevo` value ever recorded for the player in `historial_elo`.
   * Represents a lifetime peak milestone, not the current ELO.
   * Defaults to 0 when no history exists or when the query fails.
   */
  peakElo: number;
}
