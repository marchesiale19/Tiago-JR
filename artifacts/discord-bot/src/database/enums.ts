// ---------------------------------------------------------------------------
// Enums & typed constants for the competitive system.
// Business logic MUST use these values — never raw strings.
// ---------------------------------------------------------------------------

export const UserStatus = {
  Active:    "active",
  Suspended: "suspended",
  Banned:    "banned",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const LobbyStatus = {
  Waiting:    "waiting",
  InProgress: "in_progress",
  Finished:   "finished",
  Cancelled:  "cancelled",
} as const;
export type LobbyStatus = (typeof LobbyStatus)[keyof typeof LobbyStatus];

export const MatchStatus = {
  InProgress: "in_progress",
  Finished:   "finished",
  Cancelled:  "cancelled",
} as const;
export type MatchStatus = (typeof MatchStatus)[keyof typeof MatchStatus];

export const ParticipantStatus = {
  Playing:   "playing",
  Abandoned: "abandoned",
  Expelled:  "expelled",
  Finished:  "finished",
} as const;
export type ParticipantStatus = (typeof ParticipantStatus)[keyof typeof ParticipantStatus];

export const ReportStatus = {
  Pending:   "pending",
  Reviewing: "reviewing",
  Resolved:  "resolved",
  Dismissed: "dismissed",
} as const;
export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

export const EloMotivo = {
  Victory:        "victory",
  Defeat:         "defeat",
  Abandon:        "abandon",
  Expulsion:      "expulsion",
  StaffReversion: "staff_reversion",
  SeasonReset:    "season_reset",
} as const;
export type EloMotivo = (typeof EloMotivo)[keyof typeof EloMotivo];

export const PlayerRole = {
  Impostor:   "impostor",
  Tripulante: "tripulante",
} as const;
export type PlayerRole = (typeof PlayerRole)[keyof typeof PlayerRole];

export const AuditModulo = {
  Matchmaking: "matchmaking",
  Reports:     "reports",
  Elo:         "elo",
  Seasons:     "seasons",
  Lobbys:      "lobbys",
  Admin:       "admin",
} as const;
export type AuditModulo = (typeof AuditModulo)[keyof typeof AuditModulo];
