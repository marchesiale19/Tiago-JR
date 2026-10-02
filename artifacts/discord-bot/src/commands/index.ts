import {
  Collection,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";

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

// gestión de temporadas
import * as abrir from "./abrir";
import * as cerrar from "./cerrar";
import * as reputacion from "./reputacion";
import * as ver from "./ver";

// sistema de lotería
import * as loteria from "./loteria";

export interface BotCommand {
  data: {
    name: string;
    toJSON: () => unknown;
  };

  execute: (
    interaction: ChatInputCommandInteraction,
  ) => Promise<void>;

  autocomplete?: (
    interaction: AutocompleteInteraction,
  ) => Promise<void>;
}

export const commands: Collection<
  string,
  BotCommand
> = new Collection();

/* ============================================================
 * APLICACIONES PRO
 * ============================================================ */

commands.set(
  postular.data.name,
  postular,
);

commands.set(
  sanciones.data.name,
  sanciones,
);

/* ============================================================
 * SEASONS, RANKING Y PROFILES
 * ============================================================ */

commands.set(
  temporada.data.name,
  temporada,
);

commands.set(
  ranking.data.name,
  ranking,
);

commands.set(
  perfil.data.name,
  perfil,
);

commands.set(
  logros.data.name,
  logros,
);

commands.set(
  luckybox.data.name,
  luckybox,
);

commands.set(
  tateti.data.name,
  tateti,
);

commands.set(
  ppt.data.name,
  ppt,
);

commands.set(
  asignarRangoData.name,
  {
    data: asignarRangoData,
    execute: asignarRangoExecute,
  },
);

commands.set(
  leaderboard.data.name,
  leaderboard,
);

/* ============================================================
 * FLUJO DEL RANKED
 * ============================================================ */

commands.set(
  buscarPartida.data.name,
  buscarPartida,
);

commands.set(
  partida.data.name,
  partida,
);

commands.set(
  registrarPartida.data.name,
  registrarPartida,
);

commands.set(
  sala.data.name,
  sala,
);

commands.set(
  finalizarPartida.data.name,
  finalizarPartida,
);

commands.set(
  supervisorInactivo.data.name,
  supervisorInactivo,
);

/* ============================================================
 * GESTIÓN DE TEMPORADAS
 * ============================================================ */

commands.set(
  abrir.data.name,
  abrir,
);

commands.set(
  cerrar.data.name,
  cerrar,
);

commands.set(
  reputacion.data.name,
  reputacion,
);

commands.set(
  ver.data.name,
  ver,
);

/* ============================================================
 * GESTIÓN DE COLA
 * ============================================================ */

commands.set(
  cancelar.data.name,
  cancelar,
);

commands.set(
  emparejamiento.data.name,
  emparejamiento,
);

/* ============================================================
 * GESTIÓN DE HELP
 * ============================================================ */

commands.set(
  helpData.name,
  {
    data: helpData,
    execute: helpExecute,
  },
);

/* ============================================================
 * LOTERÍA
 *
 * Comandos:
 *
 * /anotar
 * /notas
 * /girar
 *
 * Y por prefijo:
 *
 * -anotar
 * -notas
 * -girar
 * ============================================================ */

/**
 * Crea un comando independiente que utiliza el sistema
 * interno de lotería.
 *
 * loteria.execute() utiliza interaction.options.getSubcommand()
 * para determinar qué acción ejecutar.
 *
 * Como queremos que sean tres Slash Commands separados,
 * hacemos que cada wrapper le devuelva su propio nombre.
 */
function crearComandoLoteria(
  nombre: "anotar" | "notas" | "girar",
): BotCommand {
  const data = {
    name: nombre,
    description:
      nombre === "anotar"
        ? "Registra a los participantes actuales de la lotería."
        : nombre === "notas"
          ? "Muestra los participantes actuales de la lotería."
          : "Realiza el sorteo de la lotería.",
  };

  return {
    data: {
      name: data.name,

      toJSON: () => ({
        name: data.name,
        description: data.description,
      }),
    },

    async execute(
      interaction: ChatInputCommandInteraction,
    ): Promise<void> {
      /*
       * Creamos un Proxy para que loteria.execute()
       * vea el subcomando correspondiente sin modificar
       * la interacción real de Discord.
       */
      const interactionProxy =
        new Proxy(
          interaction,
          {
            get(
              target,
              property,
              receiver,
            ) {
              if (
                property ===
                "options"
              ) {
                return new Proxy(
                  target.options,
                  {
                    get(
                      optionsTarget,
                      optionsProperty,
                      optionsReceiver,
                    ) {
                      if (
                        optionsProperty ===
                        "getSubcommand"
                      ) {
                        return () =>
                          nombre;
                      }

                      return Reflect.get(
                        optionsTarget,
                        optionsProperty,
                        optionsReceiver,
                      );
                    },
                  },
                );
              }

              return Reflect.get(
                target,
                property,
                receiver,
              );
            },
          },
        );

      await loteria.execute(
        interactionProxy as ChatInputCommandInteraction,
      );
    },
  };
}

/* ------------------------------------------------------------
 * SLASH COMMANDS DE LOTERÍA
 * ------------------------------------------------------------ */

commands.set(
  "anotar",
  crearComandoLoteria("anotar"),
);

commands.set(
  "notas",
  crearComandoLoteria("notas"),
);

commands.set(
  "girar",
  crearComandoLoteria("girar"),
);
