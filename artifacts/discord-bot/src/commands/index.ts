import {
  Collection,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  type Message,
} from "discord.js";

import * as rolesCommand from "./roles";
import * as postular from "./postular";
import {
  data as helpData,
  execute as helpExecute,
} from "./help";
import {
  data as asignarRangoData,
  execute as asignarRangoExecute,
} from "./asignarRango";
import * as sanciones from "./sanciones";
import * as temporada from "./temporada";
import * as ranking from "./ranking";
import * as perfil from "./perfil";
import * as logros from "./logros";
import * as luckybox from "./luckybox";
import * as bomb from "./bomb";
import * as tateti from "./tateti";
import * as ppt from "./ppt";
import * as leaderboard from "./leaderboard";
import * as racha from "./racha";
import * as crearMision from "./crearmision";
import * as misiones from "./misiones";
import * as borrarmision from "./borrarmision";
import * as resetcasino from "./resetcasino";
import * as resetinv from "./resetinv";

// Flujo de ranked
import * as buscarPartida from "./buscar-partida";
import * as partida from "./partida";
import * as registrarPartida from "./registrar-partida";
import * as sala from "./sala";
import * as finalizarPartida from "./finalizar-partida";
import * as supervisorInactivo from "./supervisor-inactivo";

// Gestión de cola
import * as cancelar from "./cancelar";
import * as emparejamiento from "./emparejamiento";

// Gestión de temporadas
import * as abrir from "./abrir";
import * as cerrar from "./cerrar";
import * as reputacion from "./reputacion";
import * as ver from "./ver";

// Sistema de lotería
import * as loteria from "./loteria";

// Sistema de clear
import * as clear from "./clear";

export interface BotCommand {
  data: {
    name: string;
    toJSON: () => unknown;
  };

  execute: (
    interaction: ChatInputCommandInteraction,
  ) => Promise<void>;

  run?: (
    message: Message,
    args: string[],
    commandName?: string,
  ) => Promise<void>;

  autocomplete?: (
    interaction: AutocompleteInteraction,
  ) => Promise<void>;
}

export const commands: Collection<string, BotCommand> =
  new Collection();

/* ============================================================
 * APLICACIONES PRO
 * ============================================================ */

commands.set(postular.data.name, postular);
commands.set(sanciones.data.name, sanciones);
commands.set(resetcasino.data.name, resetcasino);
commands.set(resetinv.data.name, resetinv);

commands.set(rolesCommand.data.data.name, {
  data: rolesCommand.data.data,
  execute: rolesCommand.data.execute,
  run: rolesCommand.data.run,
});

/* ============================================================
 * TEMPORADAS, RANKING Y PERFILES
 * ============================================================ */

commands.set(temporada.data.name, temporada);
commands.set(ranking.data.name, ranking);
commands.set(perfil.data.name, perfil);
commands.set(logros.data.name, logros);
commands.set(luckybox.data.name, luckybox);
commands.set(bomb.data.name, bomb);
commands.set(tateti.data.name, tateti);
commands.set(ppt.data.name, ppt);
commands.set(asignarRangoData.name, {
  data: asignarRangoData,
  execute: asignarRangoExecute,
});
commands.set(leaderboard.data.name, leaderboard);

// Racha
commands.set(racha.data.name, racha);

/* ============================================================
 * SISTEMA DE MISIONES
 * ============================================================ */

commands.set(
  crearMision.crearmision.data.name,
  crearMision.crearmision,
);

commands.set(misiones.data.name, misiones);
commands.set(borrarmision.data.name, borrarmision);

/* ============================================================
 * FLUJO DEL RANKED
 * ============================================================ */

commands.set(buscarPartida.data.name, buscarPartida);
commands.set(partida.data.name, partida);
commands.set(registrarPartida.data.name, registrarPartida);
commands.set(sala.data.name, sala);
commands.set(finalizarPartida.data.name, finalizarPartida);
commands.set(
  supervisorInactivo.data.name,
  supervisorInactivo,
);

/* ============================================================
 * GESTIÓN DE TEMPORADAS
 * ============================================================ */

commands.set(abrir.data.name, abrir);
commands.set(cerrar.data.name, cerrar);
commands.set(reputacion.data.name, reputacion);
commands.set(ver.data.name, ver);

/* ============================================================
 * GESTIÓN DE COLA
 * ============================================================ */

commands.set(cancelar.data.name, cancelar);
commands.set(emparejamiento.data.name, emparejamiento);

/* ============================================================
 * GESTIÓN DE HELP
 * ============================================================ */

commands.set(helpData.name, {
  data: helpData,
  execute: helpExecute,
});

/* ============================================================
 * SISTEMA DE LOTERÍA
 *
 * Comandos:
 * /anotar
 * /notas
 * /girar
 *
 * Prefijos:
 * -anotar
 * -notas
 * -girar
 * ============================================================ */

function crearComandoLoteria(
  nombre: "anotar" | "notas" | "girar",
): BotCommand {
  const description =
    nombre === "anotar"
      ? "Registra a los participantes actuales de la lotería."
      : nombre === "notas"
        ? "Muestra los participantes actuales de la lotería."
        : "Realiza el sorteo de la lotería.";

  return {
    data: {
      name: nombre,
      toJSON: () => ({
        name: nombre,
        description,
      }),
    },

    async execute(
      interaction: ChatInputCommandInteraction,
    ): Promise<void> {
      const interactionProxy = new Proxy(interaction, {
        get(target, property, receiver) {
          if (property === "options") {
            return new Proxy(target.options, {
              get(
                optionsTarget,
                optionsProperty,
                optionsReceiver,
              ) {
                if (optionsProperty === "getSubcommand") {
                  return () => nombre;
                }

                return Reflect.get(
                  optionsTarget,
                  optionsProperty,
                  optionsReceiver,
                );
              },
            });
          }

          return Reflect.get(target, property, receiver);
        },
      });

      await loteria.execute(
        interactionProxy as ChatInputCommandInteraction,
      );
    },
  };
}

commands.set("anotar", crearComandoLoteria("anotar"));
commands.set("notas", crearComandoLoteria("notas"));
commands.set("girar", crearComandoLoteria("girar"));
