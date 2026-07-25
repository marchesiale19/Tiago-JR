// ---------------------------------------------------------------------------
// EloService — Pure ELO calculation engine.
//
// Rules:
//   • Default initial ELO : 1200 (fallback for players not in DB)
//   • K-factor            : 32
//   • Team comparison     : average ELO of Tripulantes vs average ELO of Impostores
//   • EMPATE              : delta = 0 for everyone (no stat changes)
//   • CANCELADA           : delta = 0 for everyone (caller skips historial_elo inserts)
//
// No DB calls, no Discord API calls. Pure math only.
// ---------------------------------------------------------------------------

export const DEFAULT_ELO = 1200;
const K_FACTOR = 32;

// ── Types ──────────────────────────────────────────────────────────────────

export type MatchResultado = "IMPOSTORES" | "TRIPULANTES" | "EMPATE" | "CANCELADA";

export interface PlayerSlot {
  discordId: string;
  rol:       "impostor" | "tripulante";
  /** ELO snapshot captured at match creation — used for win-probability calc. */
  eloInicio: number;
}

export interface EloChange {
  discordId: string;
  rol:       "impostor" | "tripulante";
  eloInicio: number;
  /** Signed integer to add to the player's current ELO in `usuarios`. */
  delta:     number;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Calculate ELO deltas for every player in a match.
 *
 * Uses `eloInicio` (historical snapshot) for win-probability, so results are
 * always reproducible regardless of subsequent ELO changes.
 *
 * Returned `delta` must be added to the player's CURRENT ELO (not eloInicio).
 */
export function calculateEloChanges(
  players:   PlayerSlot[],
  resultado: MatchResultado,
): EloChange[] {
  // EMPATE / CANCELADA — no ELO movement
  if (resultado === "CANCELADA" || resultado === "EMPATE") {
    return players.map((p) => ({ ...p, delta: 0 }));
  }

  const tripulantes = players.filter((p) => p.rol === "tripulante");
  const impostores  = players.filter((p) => p.rol === "impostor");

  if (tripulantes.length === 0 || impostores.length === 0) {
    // Degenerate case — cannot compute meaningful ELO; return zero deltas
    return players.map((p) => ({ ...p, delta: 0 }));
  }

  const avgEloTripulantes = average(tripulantes.map((p) => p.eloInicio));
  const avgEloImpostores  = average(impostores.map((p) => p.eloInicio));

  // Standard ELO expected scores
  const expectedTripulantes = 1 / (1 + Math.pow(10, (avgEloImpostores - avgEloTripulantes) / 400));
  const expectedImpostores  = 1 - expectedTripulantes;

  // Actual scores: 1 = won, 0 = lost
  const actualTripulantes = resultado === "TRIPULANTES" ? 1 : 0;
  const actualImpostores  = resultado === "IMPOSTORES"  ? 1 : 0;

  // K * (actual - expected), rounded to nearest integer
  const deltaTripulantes = Math.round(K_FACTOR * (actualTripulantes - expectedTripulantes));
  const deltaImpostores  = Math.round(K_FACTOR * (actualImpostores  - expectedImpostores));

  return [
    ...tripulantes.map((p) => ({ ...p, delta: deltaTripulantes })),
    ...impostores.map((p)  => ({ ...p, delta: deltaImpostores  })),
  ];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
