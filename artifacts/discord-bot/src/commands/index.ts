import {
  Collection,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import * as postular                 from "./postular";
import { data as helpData, execute as helpExecute } from "./help";
import { data as asignarRangoData, execute as asignarRangoExecute } from "./asignarRango";
import * as sanciones                from "./sanciones";
import * as temporada                from "./temporada";
import * as ranking                  from "./ranking";
import * as perfil                   from "./perfil";
import * as logros                   from "./logros";
import * as luckybox                 from "./luckybox";
import * as roleOverride             from "./roleOverride";
import * as leaderboard from "./leaderboard";
// ── New ranked workflow commands ───────────────────────────────────────────
import * as buscarPartida            from "./buscar-partida";
import * as partida                  from "./partida";
import * as registrarPartida         from "./registrar-partida";
import * as sala                     from "./sala";
import * as finalizarPartida         from "./finalizar-partida";
import * as supervisorInactivo       from "./supervisor-inactivo";
// ── Patch Pack 2 commands ──────────────────────────────────────────────────
import * as cancelar                 from "./cancelar";
import * as emparejamiento           from "./emparejamiento";
// ── Postulaciones commands ─────────────────────────────────────────────────
import * as abrirPostulaciones       from "./abrir-postulaciones";
import * as cerrarPostulaciones      from "./cerrar-postulaciones";
// ── Season Management commands (Separated) ─────────────────────────────────
import * as abrir                    from "./abrir";
import * as cerrar                   from "./cerrar";

export interface BotCommand {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export const commands: Collection<string, BotCommand> = new Collection();

// ── Applications ───────────────────────────────────────────────────────────
commands.set(postular.data.name,            postular);
commands.set(sanciones.data.name,           sanciones);
commands.set(abrirPostulaciones.data.name,  abrirPostulaciones);
commands.set(cerrarPostulaciones.data.name, cerrarPostulaciones);

// ── Season / Rankings / Profile ────────────────────────────────────────────
commands.set(temporada.data.name,           temporada);
commands.set(ranking.data.name,             ranking);
commands.set(perfil.data.name,              perfil);
commands.set(logros.data.name,              logros);
commands.set(luckybox.data.name,            luckybox);
commands.set(asignarRangoData.name,         { data: asignarRangoData, execute: asignarRangoExecute });
commands.set(leaderboard.data.name, leaderboard);

// ── Ranked match workflow ──────────────────────────────────────────────────
commands.set(buscarPartida.data.name,       buscarPartida);
commands.set(partida.data.name,             partida);
commands.set(registrarPartida.data.name,    registrarPartida);
commands.set(sala.data.name,                sala);
commands.set(finalizarPartida.data.name,    finalizarPartida);
commands.set(supervisorInactivo.data.name,  supervisorInactivo);

// ── Season management ──────────────────────────────────────────────────────
commands.set(abrir.data.name,               abrir);
commands.set(cerrar.data.name,              cerrar);

// ── Queue management ───────────────────────────────────────────────────────
commands.set(cancelar.data.name,            cancelar);
commands.set(emparejamiento.data.name,      emparejamiento);

// help is imported piecemeal to avoid re-exporting its internal helpers
commands.set(helpData.name, { data: helpData, execute: helpExecute });