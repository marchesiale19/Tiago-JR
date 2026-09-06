// Almacena en memoria el número de rango simulado para tu ID (1369782550985445429)
let simulatedLevel: number | null = null;

export const MY_DISCORD_ID = "1369782550985445429";

export function setSimulatedLevel(level: number | null) {
  simulatedLevel = level;
}

export function getSimulatedLevel(): number | null {
  return simulatedLevel;
}
