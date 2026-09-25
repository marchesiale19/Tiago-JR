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
import { getSimulatedLevel, MY_DISCORD_ID } from "./roleOverride";

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

type AccessLevel = "user" | "staff" | "owner";

function getMemberAccessLevel(
  member: GuildMember | null | undefined,
  userId?: string,
): AccessLevel {
  if (userId === MY_DISCORD_ID) {
    const simLevel = getSimulatedLevel();

    if (simLevel !== null) {
      if (simLevel === 1) return "user";
      if (simLevel === 2) return "staff";
      if (simLevel >= 3) return "owner";
    }
  }

  if (!member) return "user";

  const roleCache = member.roles.cache;

  if (!roleCache) return "user";

  const roleIds = roleCache.map((role) => role.id);

  if (
    roleIds.some((id) =>
      TIER_1_ROLES.includes(id),
    )
  ) {
    return "owner";
  }

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

interface CategoryData {
  label: string;
  description: string;
  emoji: string;
  title: string;
  content: string;
}

function getCategories(
  access: AccessLevel,
): CategoryData[] {
  /*
   * Estas categorías están disponibles para todos
   * los usuarios independientemente de su rango.
   */
  const categories: CategoryData[] = [
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

    {
      label: "Casino",
      description: "Sistema de economía.",
      emoji: "🎰",
      title: "Casino",
      content: [
        "-luckybox abrir — Abre una Lucky Box.",
        "-luckybox info — Muestra información detallada sobre las Lucky Boxes.",
        "-piedrapapeltijera — Juega un 1v1 de Piedra, Papel o Tijera apostando frijoles.",
        "-tateti — Juega un 5x5 de Ta-Te-Ti apostando frijoles contra otro usuario.",
      ].join("\n"),
    },

    /*
     * REPUTACIÓN
     *
     * Esta categoría está fuera de cualquier comprobación
     * de access, por lo que TODOS los usuarios pueden verla.
     */
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
  ];

  /*
   * Estas categorías solamente aparecen para Staff/Owner.
   */
  if (
    access === "staff" ||
    access === "owner"
  ) {
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

    categories.push({
      label: "Administración",
      description:
        "Gestión de sanciones y moderación avanzada.",
      emoji: "👑",
      title: "Administración",
      content: [
        "-sanciones — Consulta la información de una sanción.",
        ...(access === "owner"
          ? [
              "-leaderboard sync — Sincroniza y actualiza la tabla de clasificación del casino con los datos más recientes.",
            ]
          : []),
      ].join("\n"),
    });

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

  /*
   * Postulaciones
   */
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

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription(
    "Muestra el centro de ayuda interactivo.",
  );

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

  const categories = getCategories(access);
  const initialCat = categories[0];

  const buildEmbed = (
    category: CategoryData,
  ) => {
    return new EmbedBuilder()
      .setColor("Orange")
      .setTitle(
        `${category.emoji} ${category.title}`,
      )
      .setDescription(
        `${category.description}\n\n` +
          `**Comandos**\n` +
          category.content,
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

  let response: any;

  if (editMethod) {
    response = await replyMethod({
      embeds: [buildEmbed(initialCat)],
      components:
        buildComponents() as any,
      fetchReply: true,
    });
  } else {
    response = await replyMethod({
      embeds: [buildEmbed(initialCat)],
      components:
        buildComponents() as any,
    });
  }

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

      /*
       * Selector de categorías
       */
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

      /*
       * Botones
       */
      if (i.isButton()) {
        const button =
          i as ButtonInteraction;

        if (
          button.customId ===
          "help_home"
        ) {
          await button.update({
            embeds: [
              buildEmbed(initialCat),
            ],
            components:
              buildComponents() as any,
          });

          return;
        }

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

  /*
   * Cuando expira el menú, eliminamos
   * los componentes interactivos.
   */
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
