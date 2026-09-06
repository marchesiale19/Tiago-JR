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
} from "discord.js";

const ROLE_STAFF = "1454679144230289510";

// Tier 1 (Owners, Dev, Management, Upper Admins)
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

// Tier 2 (Staff operativo / Moderación / Helpers / Support)
const TIER_2_ROLES = [
  "1509760269071679498", // Trial Helper
  "1528974868329009162", // Helper
  "1522808445391212674", // Support
  "1509760381525164123", // Moderador [PB]
  "1452784726413672643", // Moderador
];

type AccessLevel = "user" | "staff" | "owner";

function getUserAccessLevel(interaction: ChatInputCommandInteraction): AccessLevel {
  const member = interaction.member;
  if (!member || typeof member === "string" || !("roles" in member) || typeof member.roles === "string") {
    return "user";
  }

  const memberRolesCache = (member.roles as any).cache;
  if (!memberRolesCache) return "user";

  const roleIds = memberRolesCache.map((r: any) => r.id as string);

  // Check Tier 1 (Owners / High Staff)
  if (roleIds.some((id: string) => TIER_1_ROLES.includes(id))) {
    return "owner";
  }

  // Check Tier 2 (Staff regular / Mods / Helpers)
  if (roleIds.some((id: string) => TIER_2_ROLES.includes(id) || id === ROLE_STAFF)) {
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

function getCategories(access: AccessLevel): CategoryData[] {
  const categories: CategoryData[] = [
    {
      label: "Partidas Ranked",
      description: "Sistema de emparejamiento y partidas.",
      emoji: "🎮",
      title: "Partidas Ranked",
      content: [
        "-buscar partida — Únete a la cola de búsqueda (requiere estar en un vc de Among Us).",
        "-cancelar emparejamiento — Sal de la cola de emparejamiento.",
        "-emparejamiento estado — Muestra el estado actual de la cola.",
        "-partida estado — Muestra el estado de tu partida activa.",
      ].join("\n"),
    },
    {
      label: "Estadísticas",
      description: "Consulta de ELO, perfiles y logros.",
      emoji: "📊",
      title: "Estadísticas",
      content: [
        "-ranking — Consulta el ranking de ELO de la temporada activa.",
        "-temporada info — Muestra información sobre la temporada activa.",
        "-perfil — Muestra el perfil competitivo de un jugador.",
        "-logros — Muestra los logros de un jugador.",
      ].join("\n"),
    },
    {
      label: "Casino",
      description: "Sistema de Lucky Boxes y economía.",
      emoji: "🎰",
      title: "Casino",
      content: [
        "-lb abrir — Abre una Lucky Box.",
        "-lb info — Muestra información detallada sobre las Lucky Boxes.",
      ].join("\n"),
    },
  ];

  if (access === "staff" || access === "owner") {
    categories.push({
      label: "Supervisión",
      description: "Herramientas de control para partidas y voz.",
      emoji: "👮",
      title: "Supervisión",
      content: [
        "-registrar partida — Registra el código y mapa de la partida activa.",
        "-finalizar partida — Finaliza la partida, declara el ganador y envía el cuestionario.",
        "-sala mute — Silencia a todos en el canal de voz ranked.",
        "-sala unmute — Quita el silencio a todos en el canal de voz ranked.",
        "-supervisor inactivo — Solicita un supervisor de reemplazo para la partida activa.",
      ].join("\n"),
    });

    categories.push({
      label: "Administración",
      description: "Gestión de sanciones y moderación avanzada.",
      emoji: "👑",
      title: "Administración",
      content: [
        "-sanciones — Consulta la información de una sanción.",
        ...(access === "owner" ? ["-lb sync — Sincroniza y actualiza la tabla de clasificación del casino de forma manual con los datos más recientes de los usuarios."] : []),
      ].join("\n"),
    });

    categories.push({
      label: "Temporada",
      description: "Control de temporadas ranked.",
      emoji: "🌟",
      title: "Temporada",
      content: [
        ...(access === "owner" ? [
          "-abrir temporada — Abre una nueva temporada ranked.",
          "-cerrar temporada — Cierra la temporada activa.",
        ] : []),
        "-temporada info — Muestra la información de una temporada.",
      ].join("\n"),
    });
  }

  const postRows = [
    "-postular — Inicia el proceso de postulación al staff.",
  ];
  if (access === "owner") {
    postRows.push(
      "-abrir postulaciones — Abre el período de postulaciones al staff.",
      "-cerrar postulaciones — Cierra el período de postulaciones al staff."
    );
  }

  categories.push({
    label: "Postulaciones",
    description: "Proceso de admisión al equipo.",
    emoji: "📋",
    title: "Postulaciones",
    content: postRows.join("\n"),
  });

  return categories;
}

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Muestra el centro de ayuda interactivo.");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (interaction.guild) {
    await interaction.guild.roles.fetch();
  }

  const access = getUserAccessLevel(interaction);
  const categories = getCategories(access);

  const initialCat = categories[0];

  const buildEmbed = (cat: CategoryData) => {
    return new EmbedBuilder()
      .setColor("Orange")
      .setTitle(`${cat.emoji} ${cat.title}`)
      .setDescription(`${cat.description}\n\n**Comandos**\n${cat.content}`)
      .setImage("https://i.postimg.cc/NftRNWyr/1783848277486.png")
      .setFooter({ text: "TIAGO JR • Centro de Ayuda • Usá el menú para cambiar de categoría" })
      .setTimestamp();
  };

  const buildComponents = () => {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("help_menu")
      .setPlaceholder("Seleccioná una categoría...")
      .addOptions(
        categories.map((c) => ({
          label: c.label,
          description: c.description.slice(0, 100),
          value: c.label,
          emoji: c.emoji,
        }))
      );

    const rowMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const rowButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("help_home")
        .setLabel("Inicio")
        .setEmoji("🏠")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("help_close")
        .setLabel("Cerrar")
        .setEmoji("✖️")
        .setStyle(ButtonStyle.Danger)
    );

    return [rowMenu, rowButtons];
  };

  const response = await interaction.reply({
    embeds: [buildEmbed(initialCat)],
    components: buildComponents() as any,
    fetchReply: true,
  });

  const collector = response.createMessageComponentCollector({
    time: 300_000, // 5 minutes
  });

  collector.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id) {
      await i.reply({ content: "Este menú no es para vos.", ephemeral: true });
      return;
    }

    if (i.isStringSelectMenu()) {
      const selectedValue = (i as StringSelectMenuInteraction).values[0];
      const targetCat = categories.find((c) => c.label === selectedValue);
      if (targetCat) {
        await i.update({
          embeds: [buildEmbed(targetCat)],
          components: buildComponents() as any,
        });
      }
    } else if (i.isButton()) {
      const btn = i as ButtonInteraction;
      if (btn.customId === "help_home") {
        await btn.update({
          embeds: [buildEmbed(initialCat)],
          components: buildComponents() as any,
        });
      } else if (btn.customId === "help_close") {
        await i.update({ content: "Menú cerrado.", embeds: [], components: [] }).catch(() => {});
        await i.message.delete().catch(() => {});
      }
    }
  });

  collector.on("end", () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}
