import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  GuildMember,
  Message,
} from "discord.js";

import {
  getSimulatedLevel,
  MY_DISCORD_ID,
} from "./roleOverride";

/* =========================================================
 * ROLES
 * ======================================================= */

const ROLE_STAFF = "1454679144230289510";

const TIER_1_ROLES = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1522434536796061816", // Desarrollador
  "1453211902267228160", // Administrador
  "1509760475653472287", // Administrador [PB]
  "1522807097920720967", // Manager
];

const TIER_2_ROLES = [
  "1509760269071679498", // Trial Helper
  "1528974868329009162", // Helper
  "1522808445391212674", // Support
  "1509760381525164123", // Moderador [PB]
  "1452784726413672643", // Moderador
];

/*
 * Roles que pueden utilizar/ver:
 * -luckybox dar
 */
const LUCKYBOX_GIVE_ROLES = [
  "1539368076326473868", // Developer Tiago Jr
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1455419124732657801", // Equipo Administrativo
  "1522434536796061816", // Desarrollador
  "1453211902267228160", // Administrador
  "1509760475653472287", // Administrador [PB]
  "1522807097920720967", // Manager
];

/*
 * Roles que pueden utilizar/ver:
 * -anotar
 * -girar
 *
 * Estos comandos son exclusivos para:
 * - Developer Tiago Jr
 * - Manager
 */
const LOTTERY_MANAGEMENT_ROLES = [
  "1539368076326473868", // Developer Tiago Jr
  "1522807097920720967", // Manager
];

/*
 * Roles que pueden utilizar/ver:
 * -clear
 */
const CLEAR_COMMAND_ROLES = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1455419124732657801", // Equipo Administrativo
  "1522434536796061816", // Desarrollador
  "1453211902267228160", // Administrador
  "1509760475653472287", // Administrador [PB]
];

const ROLE_MANAGEMENT_COMMAND_ROLES = [
  "1539368076326473868", // Developer Tiago Jr
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1455419124732657801", // Equipo Administrativo
  "1522434536796061816", // Desarrollador
  "1453211902267228160", // Administrador
  "1509760475653472287", // Administrador [PB]
  "1522807097920720967", // Manager
];

/*
 * Roles que pueden utilizar/ver:
 * -luckybox drop
 * -bomb drop
 */
const DROP_COMMAND_ROLES = [
  "1522807097920720967", // Manager
  "1539368076326473868", // Developer Tiago Jr
];

/*
 * Roles que pueden ver en el help:
 * /crearmision
 * -borrarmision
 *
 * Estos son los roles solicitados específicamente
 * para la administración de misiones.
 */
const MISSION_MANAGEMENT_ROLES = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1522434536796061816", // Desarrollador
  "1503876451315880016", // Administrador
  "1509760475653472287", // Administrador [PB]
  "1522807097920720967", // Manager
];

/*
 * Roles que pueden ver en el help:
 * -resetcasino
 * -resetinv
 *
 * La comprobación de permisos real también debe mantenerse
 * dentro de las implementaciones de ambos comandos.
 */
const CASINO_RESET_ROLES = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1522434536796061816", // Desarrollador
  "1503876451315880016", // Administrador
  "1509760475653472287", // Administrador [PB]
  "1522807097920720967", // Manager
];


/*
 * Roles que pueden ver en el help:
 * -darplata
 * -quitarplata
 */
const ECONOMY_MANAGEMENT_ROLES = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1522434536796061816", // Desarrollador
  "1503876451315880016", // Administrador
  "1509760475653472287", // Administrador [PB]
  "1522807097920720967", // Manager
];


/* =========================================================
 * TIPOS Y NIVEL DE ACCESO
 * ======================================================= */

type AccessLevel = "user" | "staff" | "owner";

/*
 * Obtiene los IDs de los roles tanto si recibimos
 * un GuildMember como si Discord devuelve los roles
 * como un array en una interacción slash.
 */
function getRoleIds(
  member: GuildMember | null | undefined,
): string[] {
  if (!member) return [];

  const roles = (member as any).roles;

  if (Array.isArray(roles)) {
    return roles;
  }

  if (roles?.cache) {
    return roles.cache.map(
      (role: { id: string }) => role.id,
    );
  }

  return [];
}

function getMemberAccessLevel(
  member: GuildMember | null | undefined,
  userId?: string,
): AccessLevel {
  /*
   * Nivel simulado para el usuario configurado
   * en roleOverride.
   */
  if (userId === MY_DISCORD_ID) {
    const simLevel = getSimulatedLevel();

    if (simLevel !== null) {
      if (simLevel === 1) return "user";
      if (simLevel === 2) return "staff";
      if (simLevel >= 3) return "owner";
    }
  }

  const roleIds = getRoleIds(member);

  /*
   * Tier 1 = Owner.
   */
  if (
    roleIds.some((id) =>
      TIER_1_ROLES.includes(id),
    )
  ) {
    return "owner";
  }

  /*
   * Tier 2 + rol Staff = Staff.
   */
  if (
    roleIds.some(
      (id) =>
        TIER_2_ROLES.includes(id) ||
        id === ROLE_STAFF,
    )
  ) {
    return "staff";
  }

  return "user";
}

/* =========================================================
 * PERMISOS ESPECÍFICOS
 * ======================================================= */

/*
 * Comprueba si el usuario puede ver:
 * -luckybox dar
 */
function canGiveLuckybox(
  member: GuildMember | null | undefined,
): boolean {
  return getRoleIds(member).some((id) =>
    LUCKYBOX_GIVE_ROLES.includes(id),
  );
}

/*
 * Comprueba si el usuario puede ver:
 * -anotar
 * -girar
 */
function canManageLottery(
  member: GuildMember | null | undefined,
): boolean {
  return getRoleIds(member).some((id) =>
    LOTTERY_MANAGEMENT_ROLES.includes(id),
  );
}

/*
 * Comprueba si el usuario puede ver:
 * -clear
 */
function canUseClear(
  member: GuildMember | null | undefined,
): boolean {
  return getRoleIds(member).some((id) =>
    CLEAR_COMMAND_ROLES.includes(id),
  );
}

function canManageRoles(
  member: GuildMember | null | undefined,
): boolean {
  return getRoleIds(member).some((id) =>
    ROLE_MANAGEMENT_COMMAND_ROLES.includes(id),
  );
}

/*
 * Comprueba si el usuario puede ver:
 * -luckybox drop
 * -bomb drop
 */
function canUseDropCommands(
  member: GuildMember | null | undefined,
): boolean {
  return getRoleIds(member).some((id) =>
    DROP_COMMAND_ROLES.includes(id),
  );
}

/*
 * Comprueba si el usuario puede ver:
 * /crearmision
 * -borrarmision
 */
function canManageMissions(
  member: GuildMember | null | undefined,
): boolean {
  return getRoleIds(member).some((id) =>
    MISSION_MANAGEMENT_ROLES.includes(id),
  );
}

/*
 * Comprueba si el usuario puede ver:
 * -resetcasino
 * -resetinv
 */
function canResetCasino(
  member: GuildMember | null | undefined,
): boolean {
  return getRoleIds(member).some((id) =>
    CASINO_RESET_ROLES.includes(id),
  );
}


function canManageEconomy(
  member: GuildMember | null | undefined,
): boolean {
  return getRoleIds(member).some((id) =>
    ECONOMY_MANAGEMENT_ROLES.includes(id),
  );
}

/* =========================================================
 * CATEGORÍAS DEL HELP
 * ======================================================= */

interface CategoryData {
  label: string;
  description: string;
  emoji: string;
  title: string;
  content: string;
}

function getCategories(
  access: AccessLevel,
  member: GuildMember | null | undefined,
): CategoryData[] {
  /*
   * Estas categorías están disponibles para todos
   * los usuarios independientemente de su rango.
   */
  const categories: CategoryData[] = [
    /* -----------------------------------------------------
     * PARTIDAS RANKED
     * --------------------------------------------------- */
    {
      label: "Partidas Ranked",
      description:
        "Sistema de emparejamiento y partidas.",
      emoji: "🎮",
      title: "Partidas Ranked",
      content: [
        "/buscar partida — Únete a la cola de búsqueda (requiere estar en un VC de Among Us).",
        "/cancelar emparejamiento — Sal de la cola de emparejamiento.",
        "/emparejamiento estado — Muestra el estado actual de la cola.",
        "/partida estado — Muestra el estado de tu partida activa.",
      ].join("\n"),
    },

    /* -----------------------------------------------------
     * ESTADÍSTICAS
     * --------------------------------------------------- */
    {
      label: "Estadísticas",
      description:
        "Consulta de ELO, perfiles y logros.",
      emoji: "📊",
      title: "Estadísticas",
      content: [
        "-ranking — Consulta el ranking de ELO de la temporada activa.",
        "-perfil — Muestra el perfil competitivo de un jugador.",
        "-logros — Muestra los logros de un jugador.",
      ].join("\n"),
    },

    /* -----------------------------------------------------
     * RACHAS
     * --------------------------------------------------- */
    {
      label: "Rachas",
      description: "Consulta tus rachas de asistencia de voz.",
      emoji: "🔥",
      title: "Rachas",
      content: [
        "-racha — Consulta tu racha actual, tu récord personal y el progreso hacia la próxima recompensa.",
      ].join("\n"),
    },

    /* -----------------------------------------------------
     * CASINO
     * --------------------------------------------------- */
  
{
  label: "Casino",
  description: "Sistema de economía.",
  emoji: "🎰",
  title: "Casino",
  content: [
    /*
     * Solo Manager y los rangos superiores autorizados
     * pueden ver estos comandos en el help.
     */
    ...(canManageEconomy(member)
      ? [
          "-darplata @usuario <cantidad> <cash|bank> — Añade frijoles al efectivo o banco de un usuario.",
          "-quitarplata @usuario <cantidad> <cash|bank> — Retira frijoles del efectivo o banco de un usuario.",
        ]
      : []),

        "-luckybox abrir — Abre una Lucky Box.",
        "-luckybox info — Muestra información detallada sobre las Lucky Boxes.",
        "-collect — Reclamá las Luckybox correspondientes a tus roles.",
        "-bomb info — Muestra información detallada sobre las Bombas.",

        /*
         * Estos comandos solamente aparecen para los roles
         * autorizados a reiniciar el casino y los inventarios.
         */
        ...(canResetCasino(member)
          ? [
              "-resetcasino — Reinicia los balances del casino de todos los usuarios.",
              "-resetinv — Elimina masivamente las cajas Mr Lucky de los inventarios de los usuarios.",
            ]
          : []),

        /*
         * Este comando solamente aparece si el usuario
         * tiene alguno de los roles autorizados.
         */
        ...(canGiveLuckybox(member)
          ? [
              "-luckybox dar — Dale una caja a un usuario.",
            ]
          : []),

        /*
         * Estos comandos solamente aparecen para:
         * - Manager
         * - Developer Tiago Jr
         */
        ...(canUseDropCommands(member)
          ? [
              "-luckybox drop — Dropea un Lucky en un canal.",
              "-bomb drop — Dropea una bomba en un canal.",
            ]
          : []),

        "-math — Participa en una trivia matemática apostando frijoles.",
        "-ppt — Juega un 1v1 de Piedra, Papel o Tijera apostando frijoles.",
        "-tateti — Juega un 5x5 de Ta-Te-Ti apostando frijoles contra otro usuario.",
      ].join("\n"),
    },

    /* -----------------------------------------------------
     * LOTERÍA
     * --------------------------------------------------- */
    {
      label: "Lotería",
      description:
        "Sistema de sorteos y participantes.",
      emoji: "🎟️",
      title: "Lotería",
      content: [
        /*
         * -anotar y -girar solamente aparecen para
         * Developer Tiago Jr y Manager.
         */
        ...(canManageLottery(member)
          ? [
              "-anotar — Registra a los participantes actuales de la lotería.",
              "-girar — Realiza el sorteo de la lotería.",
            ]
          : []),

        "-notas — Muestra los participantes actuales de la lotería.",
      ].join("\n"),
    },

    /* -----------------------------------------------------
     * REPUTACIÓN
     * --------------------------------------------------- */
    {
      label: "Reputación",
      description:
        "Consulta y otorga reputación a otros usuarios.",
      emoji: "⭐",
      title: "Reputación",
      content: [
        "-rep — Dale reputación positiva o negativa a otro usuario.",
        "-ver rep — Consulta el perfil y las estadísticas de reputación de un usuario.",
        "",
      ].join("\n"),
    },

    /* -----------------------------------------------------
     * MISIONES
     * --------------------------------------------------- */
    {
      label: "Misiones",
      description:
        "Consulta y administra las misiones semanales por frijoles.",
      emoji: "🏆",
      title: "Misiones",
      content: [
        /*
         * Disponible para todos los usuarios.
         */
        "-misiones — Consulta las misiones semanales, tu progreso y las recompensas disponibles.",

        /*
         * Estos comandos solamente aparecen para los roles
         * autorizados en MISSION_MANAGEMENT_ROLES.
         */
        ...(canManageMissions(member)
          ? [
              "/crearmision — Crea una misión semanal por frijoles mediante un formulario.",
              "-borrarmision — Elimina una misión semanal y su progreso asociado.",
            ]
          : []),
      ].join("\n"),
    },
  ];

  /*
   * Estas categorías solamente aparecen para Staff/Owner.
   */
  if (
    access === "staff" ||
    access === "owner"
  ) {
    /* -----------------------------------------------------
     * SUPERVISIÓN
     * --------------------------------------------------- */
    categories.push({
      label: "Supervisión",
      description:
        "Herramientas de control para partidas y voz.",
      emoji: "👮",
      title: "Supervisión",
      content: [
        "/registrar partida — Registra el código y mapa de la partida activa.",
        "/finalizar partida — Finaliza la partida, declara el ganador y envía el cuestionario.",
        "-sala mute — Silencia a todos en el canal de voz ranked.",
        "-sala unmute — Quita el silencio a todos en el canal de voz ranked.",
        "/supervisor inactivo — Solicita un supervisor de reemplazo para la partida activa.",
      ].join("\n"),
    });

    /* -----------------------------------------------------
     * ADMINISTRACIÓN
     * --------------------------------------------------- */
    categories.push({
      label: "Administración",
      description:
        "Gestión de sanciones y moderación avanzada.",
      emoji: "👑",
      title: "Administración",
      content: [
        "-sanciones — Consulta la información de una sanción.",

        /* Estos comandos solamente aparecen para los roles autorizados. */
        ...(canManageRoles(member)
          ? [
              "-dar rol — Otorga un rol a un usuario.",
              "-quitar rol — Retira un rol de un usuario.",
            ]
          : []),

        /*
         * -clear solamente aparece para los roles
         * autorizados específicamente.
         */
        ...(canUseClear(member)
          ? [
              "-clear — Elimina una cantidad de mensajes.",
            ]
          : []),

        /*
         * Este comando solamente aparece para Owner.
         */
        ...(access === "owner"
          ? [
              "-leaderboard sync — Sincroniza y actualiza la tabla de clasificación del casino con los datos más recientes.",
            ]
          : []),
      ].join("\n"),
    });

    /* -----------------------------------------------------
     * TEMPORADA
     * --------------------------------------------------- */
    categories.push({
      label: "Temporada",
      description:
        "Control de temporadas ranked.",
      emoji: "🌟",
      title: "Temporada",
      content: [
        ...(access === "owner"
          ? [
              "-abrir temporada — Abre una nueva temporada ranked.",
              "-cerrar temporada — Cierra la temporada activa.",
            ]
          : []),

        "-temporada info — Muestra la información de una temporada.",
      ].join("\n"),
    });
  }

  /* -------------------------------------------------------
   * POSTULACIONES
   * ----------------------------------------------------- */

  const postRows = [
    "-postular — Inicia el proceso de postulación al staff.",
  ];

  if (access === "owner") {
    postRows.push(
      "-abrir postulaciones — Abre el período de postulaciones al staff.",
      "-cerrar postulaciones — Cierra el período de postulaciones al staff.",
    );
  }

  categories.push({
    label: "Postulaciones",
    description:
      "Proceso de admisión al equipo.",
    emoji: "📋",
    title: "Postulaciones",
    content: postRows.join("\n"),
  });

  return categories;
}

/* =========================================================
 * COMANDO /HELP
 * ======================================================= */

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription(
    "Muestra el centro de ayuda interactivo.",
  );

/* =========================================================
 * MENÚ DEL HELP
 * ======================================================= */

async function sendHelpMenu(
  authorId: string,
  member: GuildMember | null | undefined,
  replyMethod: (
    options: any,
  ) => Promise<any>,
  editMethod?: (
    options: any,
  ) => Promise<any>,
): Promise<void> {
  /*
   * Actualizamos la caché de roles antes de calcular
   * el nivel de acceso.
   */
  if (member?.guild) {
    await member.guild.roles.fetch().catch(() => {});
  }

  const access = getMemberAccessLevel(
    member,
    authorId,
  );

  /*
   * Pasamos también el miembro para comprobar
   * los roles específicos de Lucky Box, Lotería,
   * -clear, comandos drop, Misiones y reseteos del casino.
   */
  const categories = getCategories(
    access,
    member,
  );

  /* -------------------------------------------------------
   * CONSTRUCCIÓN DE LOS EMBEDS
   * ----------------------------------------------------- */

  // Cuenta los comandos visibles de cada categoría.
  // El resumen respeta los permisos aplicados en getCategories.
  const countCommands = (category: CategoryData): number =>
    category.content
      .split("\n")
      .filter((line) => /^\s*[-/]/.test(line))
      .length;

  // Destaca automáticamente el comando y separa su descripción.
  const formatCommandLines = (content: string): string =>
    content
      .split("\n")
      .map((line) => {
        const separator = line.indexOf(" — ");

        // Conserva las líneas vacías o que no sean comandos.
        if (separator === -1) return line;

        const commandName = line.slice(0, separator).trim();
        const description = line.slice(separator + 3);

        return `\`${commandName}\` — ${description}`;
      })
      .join("\n");

  // Pantalla inicial del Centro de Ayuda.
  const buildHomeEmbed = () => {
    const embed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle("📖 TIAGO JR • Centro de Ayuda")
      .setDescription(
        [
          "¡Bienvenido al **Centro de Ayuda de TIAGO JR**!",
          "",
          "Seleccioná una categoría en el menú para consultar sus comandos. Podés cambiar de categoría sin cerrar el panel.",
          "",
          "🔹 Comandos organizados por función.",
          "🔹 Navegación rápida mediante menú desplegable.",
          "🔹 Los comandos restringidos no aparecen si no tenés los permisos necesarios.",
        ].join("\n"),
      );

    for (const category of categories) {
      embed.addFields({
        name: `${category.emoji} ${category.label}`,
        value: `${countCommands(category)} comando(s)`,
        inline: true,
      });
    }

    return embed
      .setFooter({
        text: "TIAGO JR • Centro de Ayuda • Seleccioná una categoría",
      })
      .setTimestamp();
  };

  // Embed de una categoría seleccionada.
  const buildEmbed = (category: CategoryData) => {
    return new EmbedBuilder()
      .setColor("Orange")
      .setTitle(`${category.emoji} ${category.title}`)
      .setDescription(
        `${category.description}\n\n` +
          `**Comandos**\n` +
          formatCommandLines(category.content),
      )
      .setImage(
        "https://i.postimg.cc/NftRNWyr/1783848277486.png",
      )
      .setFooter({
        text:
          "TIAGO JR • Centro de Ayuda • Usá el menú para cambiar de categoría",
      })
      .setTimestamp();
  };

  /* -------------------------------------------------------
   * COMPONENTES
   * ----------------------------------------------------- */

  const buildComponents = () => {
    const selectMenu =
      new StringSelectMenuBuilder()
        .setCustomId("help_menu")
        .setPlaceholder(
          "Seleccioná una categoría...",
        )
        .addOptions(
          categories.map((category) => ({
            label: category.label,
            description:
              category.description.slice(0, 100),
            value: category.label,
            emoji: category.emoji,
          })),
        );

    const rowMenu =
      new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(selectMenu);

    const rowButtons =
      new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId("help_home")
            .setLabel("Inicio")
            .setEmoji("🏠")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("help_close")
            .setLabel("Cerrar")
            .setEmoji("✖️")
            .setStyle(ButtonStyle.Danger),
        );

    return [
      rowMenu,
      rowButtons,
    ];
  };

  /* -------------------------------------------------------
   * ENVÍO DEL MENÚ
   * ----------------------------------------------------- */

  let response: any;

  if (editMethod) {
    response = await replyMethod({
      embeds: [buildHomeEmbed()],
      components:
        buildComponents() as any,
      fetchReply: true,
    });
  } else {
    response = await replyMethod({
      embeds: [buildHomeEmbed()],
      components:
        buildComponents() as any,
    });
  }

  /* -------------------------------------------------------
   * COLLECTOR
   * ----------------------------------------------------- */

  const collector =
    response.createMessageComponentCollector({
      time: 300_000,
    });

  collector.on(
    "collect",
    async (i: any) => {
      /*
       * Solo el usuario que abrió el menú
       * puede utilizarlo.
       */
      if (i.user.id !== authorId) {
        await i
          .reply({
            content:
              "❌ Este menú no es para vos.",
            ephemeral: true,
          })
          .catch(() => {});

        return;
      }

      /* ---------------------------------------------------
       * SELECTOR DE CATEGORÍAS
       * ------------------------------------------------- */

      if (i.isStringSelectMenu()) {
        const select =
          i as StringSelectMenuInteraction;

        const selectedValue =
          select.values[0];

        const targetCategory =
          categories.find(
            (category) =>
              category.label === selectedValue,
          );

        if (!targetCategory) {
          return;
        }

        await select.update({
          embeds: [
            buildEmbed(targetCategory),
          ],
          components:
            buildComponents() as any,
        });

        return;
      }

      /* ---------------------------------------------------
       * BOTONES
       * ------------------------------------------------- */

      if (i.isButton()) {
        const button =
          i as ButtonInteraction;

        /*
         * Botón Inicio
         */
        if (
          button.customId ===
          "help_home"
        ) {
          await button.update({
            embeds: [
              buildHomeEmbed(),
            ],
            components:
              buildComponents() as any,
          });

          return;
        }

        /*
         * Botón Cerrar
         */
        if (
          button.customId ===
          "help_close"
        ) {
          await button
            .update({
              content:
                "Menú cerrado.",
              embeds: [],
              components: [],
            })
            .catch(() => {});

          await button.message
            .delete()
            .catch(() => {});

          return;
        }
      }
    },
  );

  /* -------------------------------------------------------
   * FIN DEL COLLECTOR
   * ----------------------------------------------------- */

  collector.on("end", () => {
    if (editMethod) {
      editMethod({
        components: [],
      }).catch(() => {});
    } else {
      response
        .edit({
          components: [],
        })
        .catch(() => {});
    }
  });
}

/* =========================================================
 * EJECUCIÓN
 * ======================================================= */

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await sendHelpMenu(
    interaction.user.id,
    interaction.member as GuildMember,
    (options) =>
      interaction.reply(options),
    (options) =>
      interaction.editReply(options),
  );
}

export async function run(
  message: Message,
  _args: string[],
): Promise<void> {
  await sendHelpMenu(
    message.author.id,
    message.member as GuildMember,
    (options) =>
      message.reply(options),
  );
}
