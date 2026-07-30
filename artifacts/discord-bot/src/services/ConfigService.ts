// ---------------------------------------------------------------------------
// ConfigService — reads system parameters from `configuracion_competitiva`.
// Seeds defaults on first use so the table is never empty.
// ---------------------------------------------------------------------------

import { configRepository } from "../database/repositories/ConfigRepository";
import { ConfigKey } from "../database/enums";
import { logger } from "../lib/logger";

const DEFAULTS: Array<{ clave: string; valor: string; descripcion: string }> = [
  { clave: ConfigKey.MaxPlayers,               valor: "14",  descripcion: "Número de jugadores requeridos para llenar la cola (siempre 14)" },
  { clave: ConfigKey.SupervisorTimeoutSeconds, valor: "120", descripcion: "Segundos de timeout para supervisión (legacy)" },
  { clave: ConfigKey.CategoryId,               valor: "",    descripcion: "ID de la categoría de Discord (legacy)" },
  { clave: ConfigKey.SupervisorRoleId,         valor: "",    descripcion: "ID del rol de supervisor (legacy)" },
  { clave: ConfigKey.SupervisionChannelId,     valor: "",    descripcion: "ID del canal donde se publican solicitudes de supervisión y resultados" },
  { clave: ConfigKey.RankedVcCategoryId,       valor: "",    descripcion: "ID de la categoría donde se crean los canales de voz ranked" },
];

/** In-memory cache: reloaded lazily after each write. */
const cache = new Map<string, string>();
let seeded = false;

async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  await configRepository.seedDefaults(DEFAULTS);
  seeded = true;
}

export async function getConfig(key: ConfigKey): Promise<string> {
  await ensureSeeded();
  if (cache.has(key)) return cache.get(key)!;

  const row = await configRepository.findByKey(key);
  const value = row?.valor ?? DEFAULTS.find((d) => d.clave === key)?.valor ?? "";
  cache.set(key, value);
  return value;
}

export async function getConfigInt(key: ConfigKey, fallback: number): Promise<number> {
  const raw = await getConfig(key);
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

export async function setConfig(key: ConfigKey, valor: string): Promise<void> {
  await configRepository.upsert({ clave: key, valor });
  cache.set(key, valor);
  logger.info({ key, valor }, "Config updated");
}

/** Reload a single key from DB (call after external changes). */
export async function reloadConfig(key: ConfigKey): Promise<void> {
  cache.delete(key);
  await getConfig(key);
}
