import {
  Collection,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import * as postular from "./postular";
import * as abrirPostulaciones from "./abrir-postulaciones";
import * as cerrarPostulaciones from "./cerrar-postulaciones";
import { data as helpData, execute as helpExecute } from "./help";
import * as sanciones from "./sanciones";
import * as cola from "./cola";
import * as supervisor from "./supervisor";
import * as lobby from "./lobby";

export interface BotCommand {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export const commands: Collection<string, BotCommand> = new Collection();
commands.set(postular.data.name,           postular);
commands.set(abrirPostulaciones.data.name, abrirPostulaciones);
commands.set(cerrarPostulaciones.data.name, cerrarPostulaciones);
commands.set(sanciones.data.name,          sanciones);
commands.set(cola.data.name,               cola);
commands.set(supervisor.data.name,         supervisor);
commands.set(lobby.data.name,              lobby);

// help is imported piecemeal to avoid re-exporting its internal helpers
commands.set(helpData.name, { data: helpData, execute: helpExecute });
