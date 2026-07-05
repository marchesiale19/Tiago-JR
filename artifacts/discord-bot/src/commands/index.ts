import { Collection, type ChatInputCommandInteraction } from "discord.js";
import * as postular from "./postular";
import * as abrirPostulaciones from "./abrir-postulaciones";
import * as cerrarPostulaciones from "./cerrar-postulaciones";

export interface BotCommand {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands: Collection<string, BotCommand> = new Collection();
commands.set(postular.data.name, postular);
commands.set(abrirPostulaciones.data.name, abrirPostulaciones);
commands.set(cerrarPostulaciones.data.name, cerrarPostulaciones);
