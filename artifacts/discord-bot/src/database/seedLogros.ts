// ---------------------------------------------------------------------------
// seedLogros.ts — Idempotent seed for the `logros` achievement catalog.
//
// Called once at bot startup (from init.ts) after all tables are confirmed
// present. Uses ON CONFLICT DO NOTHING targeting the `codigo` unique
// constraint — safe to run on every boot without creating duplicates or
// throwing constraint violations.
// ---------------------------------------------------------------------------

import { db }         from "./database";
import { logrosTable } from "@workspace/db";

interface LogroSeed {
  codigo:      string;
  nombre:      string;
  descripcion: string;
  tipo:        string;
  valor:       number;
  activo:      boolean;
}

const CATALOG: LogroSeed[] = [
  {
    codigo:      "PRIMERA_VICTORIA",
    nombre:      "Primera Victoria",
    descripcion: "Gana tu primera partida competitiva.",
    tipo:        "VICTORIAS",
    valor:       1,
    activo:      true,
  },
  {
    codigo:      "VICTORIAS_10",
    nombre:      "Veterano de Guerra",
    descripcion: "Alcanza 10 victorias competitivas.",
    tipo:        "VICTORIAS",
    valor:       10,
    activo:      true,
  },
  {
    codigo:      "PARTIDAS_50",
    nombre:      "Constancia",
    descripcion: "Juega un total de 50 partidas.",
    tipo:        "PARTIDAS",
    valor:       50,
    activo:      true,
  },
  {
    codigo:      "MVP_5",
    nombre:      "Jugador Más Valioso",
    descripcion: "Obtén 5 reconocimientos como MVP.",
    tipo:        "MVP",
    valor:       5,
    activo:      true,
  },
];

/**
 * Insert the base achievement catalog.
 * Idempotent — rows that already exist (matched by `codigo`) are silently skipped.
 */
export async function seedLogros(): Promise<void> {
  await db
    .insert(logrosTable)
    .values(CATALOG)
    .onConflictDoNothing({ target: logrosTable.codigo });
}
