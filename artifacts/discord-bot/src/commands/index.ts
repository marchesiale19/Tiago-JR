import {
  Collection,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import * as postular from "./postular";
import * as abrirPostulaciones from "./abrir-postulaciones";
import * as cerrarPostulaciones from "./cerrar-postulaciones";
import { data as helpData, execute as helpExecute } from "./help"; // Importamos solo lo necesario
import * as sanciones from "./sanciones";

export interface BotCommand {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export const commands: Collection<string, BotCommand> = new Collection();
commands.set(postular.data.name, postular);
commands.set(abrirPostulaciones.data.name, abrirPostulaciones);
commands.set(cerrarPostulaciones.data.name, cerrarPostulaciones);
commands.set(sanciones.data.name, sanciones);

// Registramos el comando help usando los alias que importamos
commands.set(helpData.name, { data: helpData, execute: helpExecute });