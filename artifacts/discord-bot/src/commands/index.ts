import {
  Collection,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import * as postular from "./postular";
import { data as helpData, execute as helpExecute } from "./help";
import { data as asignarRangoData, execute as asignarRangoExecute } from "./asignarRango";
import * as sanciones from "./sanciones";
import * as temporada from "./temporada";
import * as ranking from "./ranking";
import * as perfil from "./perfil";
import * as logros from "./logros";
import * as luckybox from "./luckybox";
import * as tateti from "./tateti";  
import * as ppt from "./ppt";
import * as leaderboard from "./leaderboard";
// nuevo flujo de ranked
import * as buscarPartida from "./buscar-partida";
import * as partida from "./partida";
import * as registrarPartida from "./registrar-partida";
import * as sala from "./sala";
import * as finalizarPartida from "./finalizar-partida";
import * as supervisorInactivo from "./supervisor-inactivo";
// parche 2 o ni idea, solo pq sí 
import * as cancelar from "./cancelar";
import * as emparejamiento from "./emparejamiento";
// gestión de temporadas (separado aunrinha)
import * as abrir from "./abrir";
import * as cerrar from "./cerrar";

export interface BotCommand {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export const commands: Collection<string, BotCommand> = new Collection();

// aplicaciones pro
commands.set(postular.data.name, postular);
commands.set(sanciones.data.name, sanciones);

// seasons, ranking y profiles
commands.set(temporada.data.name, temporada);
commands.set(ranking.data.name, ranking);
commands.set(perfil.data.name, perfil);
commands.set(logros.data.name, logros);
commands.set(luckybox.data.name, luckybox);
commands.set(tateti.data.name, tateti);  
commands.set(ppt.data.name, ppt);
commands.set(asignarRangoData.name, { data: asignarRangoData, execute: asignarRangoExecute });
commands.set(leaderboard.data.name, leaderboard);

// flujo del ranked
commands.set(buscarPartida.data.name, buscarPartida);
commands.set(partida.data.name, partida);
commands.set(registrarPartida.data.name, registrarPartida);
commands.set(sala.data.name, sala);
commands.set(finalizarPartida.data.name, finalizarPartida);
commands.set(supervisorInactivo.data.name, supervisorInactivo);

// gestión de temporadas
commands.set(abrir.data.name, abrir);
commands.set(cerrar.data.name, cerrar);

// gestión de cola
commands.set(cancelar.data.name, cancelar);
commands.set(emparejamiento.data.name, emparejamiento);

// gestión de help
commands.set(helpData.name, { data: helpData, execute: helpExecute });
