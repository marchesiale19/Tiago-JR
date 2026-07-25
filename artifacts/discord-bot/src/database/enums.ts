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

// ---------------------------------------------------------------------------
// Phase 2 state machine:
//   QUEUE → WAITING_SUPERVISOR → READY → IN_GAME → VALIDATING → CLOSED
//                                                              ↘ CANCELLED
// ---------------------------------------------------------------------------
export const LobbyStatus = {
  Queue:              "queue",
  WaitingSupervisor:  "waiting_supervisor",
  Ready:              "ready",
  InGame:             "in_game",
  Validating:         "validating",
  Closed:             "closed",
  Cancelled:          "cancelled",
} as const;
export type LobbyStatus = (typeof LobbyStatus)[keyof typeof LobbyStatus];

/** Valid transitions: from → allowed targets */
export const LOBBY_TRANSITIONS: Record<LobbyStatus, LobbyStatus[]> = {
  [LobbyStatus.Queue]:             [LobbyStatus.WaitingSupervisor, LobbyStatus.Cancelled],
  [LobbyStatus.WaitingSupervisor]: [LobbyStatus.Ready, LobbyStatus.Cancelled],
  [LobbyStatus.Ready]:             [LobbyStatus.InGame, LobbyStatus.Cancelled],
  [LobbyStatus.InGame]:            [LobbyStatus.Validating, LobbyStatus.Cancelled],
  [LobbyStatus.Validating]:        [LobbyStatus.Closed, LobbyStatus.Cancelled],
  [LobbyStatus.Closed]:            [],
  [LobbyStatus.Cancelled]:         [],
};

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

// ---------------------------------------------------------------------------
// Phase 2: Derived user competitive state (never stored — computed on demand)
// ---------------------------------------------------------------------------
export const CompetitiveState = {
  Libre:             "libre",
  EnCola:            "en_cola",
  EnLobby:           "en_lobby",   // WAITING_SUPERVISOR or READY
  EnPartida:         "en_partida", // IN_GAME or VALIDATING
} as const;
export type CompetitiveState = (typeof CompetitiveState)[keyof typeof CompetitiveState];

// Config keys used in configuracion_competitiva
export const ConfigKey = {
  MaxPlayers:               "MAX_PLAYERS",
  SupervisorTimeoutSeconds: "SUPERVISOR_TIMEOUT_SECONDS",
  CategoryId:               "CATEGORY_ID",
  SupervisorRoleId:         "SUPERVISOR_ROLE_ID",
} as const;
export type ConfigKey = (typeof ConfigKey)[keyof typeof ConfigKey];
