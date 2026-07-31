import {
  Collection,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import * as postular            from "./postular";
import { data as helpData, execute as helpExecute } from "./help";
import * as sanciones           from "./sanciones";
import * as temporada           from "./temporada";
import * as ranking             from "./ranking";
import * as perfil              from "./perfil";
import * as logros              from "./logros";
// ── New ranked workflow commands ───────────────────────────────────────────
import * as buscarPartida       from "./buscar-partida";
import * as partida             from "./partida";
import * as registrarPartida    from "./registrar-partida";
import * as sala                from "./sala";
import * as finalizarPartida    from "./finalizar-partida";
import * as supervisorInactivo  from "./supervisor-inactivo";
// ── Patch Pack 2 commands ──────────────────────────────────────────────────
import * as abrir               from "./abrir";
import * as cerrar              from "./cerrar";
import * as cancelar            from "./cancelar";
import * as emparejamiento      from "./emparejamiento";

export interface BotCommand {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export const commands: Collection<string, BotCommand> = new Collection();

// ── Applications ───────────────────────────────────────────────────────────
commands.set(postular.data.name,            postular);
commands.set(sanciones.data.name,           sanciones);

// ── Season / Rankings / Profile ────────────────────────────────────────────
commands.set(temporada.data.name,           temporada);
commands.set(ranking.data.name,             ranking);
commands.set(perfil.data.name,              perfil);
commands.set(logros.data.name,              logros);

// ── Ranked match workflow ──────────────────────────────────────────────────
commands.set(buscarPartida.data.name,       buscarPartida);
commands.set(partida.data.name,             partida);
commands.set(registrarPartida.data.name,    registrarPartida);
commands.set(sala.data.name,               sala);
commands.set(finalizarPartida.data.name,    finalizarPartida);
commands.set(supervisorInactivo.data.name,  supervisorInactivo);

// ── Season management ──────────────────────────────────────────────────────
commands.set(abrir.data.name,               abrir);
commands.set(cerrar.data.name,             cerrar);

// ── Queue management ───────────────────────────────────────────────────────
commands.set(cancelar.data.name,            cancelar);
commands.set(emparejamiento.data.name,      emparejamiento);

// help is imported piecemeal to avoid re-exporting its internal helpers
commands.set(helpData.name, { data: helpData, execute: helpExecute });
