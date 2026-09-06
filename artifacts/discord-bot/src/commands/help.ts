import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from "discord.js";

const ROLE_MODERADOR    = "Moderador [PB]";
const ROLE_HELPER       = "Helper";
const ROLE_TRIAL_HELPER = "Trial Helper";
const ROLE_SUPERVISOR   = "Supervisor";

// Tier 1 = Moderador [PB] or higher         → sees everything
// Tier 2 = Helper or Trial Helper             → sees Supervisión + Administración
// Tier 2S = Supervisor only                   → sees Supervisión, NOT Administración
// Tier 3 = everyone else                    → ranked + stats only
type Tier = 1 | 2 | "2S" | 3;

function getUserTier(interaction: ChatInputCommandInteraction): Tier {
  const guild  = interaction.guild;
  const member = interaction.member;

  if (!guild || !member || typeof member === "string") return 3;
  if (!("roles" in member) || typeof member.roles === "string") return 3;

  const memberRolesCache = (member.roles as any).cache;
  if (!memberRolesCache) return 3;

  const highestPosition: number = Math.max(
    0,
    ...memberRolesCache.map((r: any) => r.position as number),
  );

  const modRole        = guild.roles.cache.find((r) => r.name === ROLE_MODERADOR);
  const trialRole      = guild.roles.cache.find((r) => r.name === ROLE_TRIAL_HELPER);
  const helperRole     = guild.roles.cache.find((r) => r.name === ROLE_HELPER);

  // Tier 1: Moderador [PB] or higher in the hierarchy
  if (modRole && highestPosition >= modRole.position) return 1;

  // Tier 2: Trial Helper or Helper (or any role at/above their position)
  const adminMinPosition = trialRole?.position ?? helperRole?.position;
  if (adminMinPosition != null && highestPosition >= adminMinPosition) return 2;

  // Tier 2S: Supervisor only — supervision access but no administration
  const hasSupervisor = memberRolesCache.some((r: any) => r.name === ROLE_SUPERVISOR);
  if (hasSupervisor) return "2S";

  return 3;
}

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Muestra la lista de comandos disponibles.");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (interaction.guild) {
    await interaction.guild.roles.fetch();
  }

  const tier = getUserTier(interaction);

  const embed = new EmbedBuilder()
    .setTitle("📖 Ayuda - TIAGO JR")
    .setDescription("Comandos disponibles para tu rango")
    .setColor("Orange")
    .setImage("https://i.postimg.cc/NftRNWyr/1783848277486.png")
    .setTimestamp();

  // ── 🎮 Partidas Ranked (everyone) ─────────────────────────────────────────
  embed.addFields({
    name: "🎮 Partidas Ranked",
    value: [
      "-buscar partida — Únete a la cola de búsqueda (requiere estar en un vc de Among Us).",
      "-cancelar emparejamiento — Sal de la cola de emparejamiento.",
      "-emparejamiento estado — Muestra el estado actual de la cola.",
      "-partida estado — Muestra el estado de tu partida activa.",
    ].join("\n"),
  });

  // ── 📊 Estadísticas (everyone) ────────────────────────────────────────────
  embed.addFields({
    name: "📊 Estadísticas",
    value: [
      "-ranking — Consulta el ranking de ELO de la temporada activa.",
      "-temporada info — Muestra información sobre la temporada activa.",
      "-perfil — Muestra el perfil competitivo de un jugador.",
      "-logros — Muestra los logros de un jugador.",
    ].join("\n"),
  });

  // ── 🎰 Casino (everyone) ──────────────────────────────────────────────────
  embed.addFields({
    name: "🎰 Casino",
    value: [
      "-lb abrir — Abre una Lucky Box.",
      "-lb info — Muestra información detallada sobre las Lucky Boxes.",
    ].join("\n"),
  });

  // ── 👮 Supervisión (Tier 1, 2, and 2S) ───────────────────────────────────
  if (tier === 1 || tier === 2 || tier === "2S") {
    embed.addFields({
      name: "👮 Supervisión",
      value: [
        "-registrar partida — Registra el código y mapa de la partida activa.",
        "-finalizar partida — Finaliza la partida, declara el ganador y envía el cuestionario.",
        "-sala mute — Silencia a todos en el canal de voz ranked.",
        "-sala unmute — Quita el silencio a todos en el canal de voz ranked.",
        "-supervisor inactivo — Solicita un supervisor de reemplazo para la partida activa.",
      ].join("\n"),
    });
  }

  // ── 👑 Administración (Tier 1 & 2 only — NOT Supervisor) ─────────────────
  if (tier === 1 || tier === 2) {
    embed.addFields({
      name: "👑 Administración",
      value: [
        "-sanciones — Consulta la información de una sanción.",
        "-lb sync — Sincroniza y actualiza la tabla de clasificación del casino de forma manual con los datos más recientes de los usuarios.",
      ].join("\n"),
    });
  }

  // ── 🌟 Temporada (Tier 1 only) ────────────────────────────────────────────
  if (tier === 1) {
    embed.addFields({
      name: "🌟 Temporada",
      value: [
        "-abrir temporada — Abre una nueva temporada ranked.",
        "-cerrar temporada — Cierra la temporada activa.",
      ].join("\n"),
    });
  }

  // ── 📋 Postulaciones ──────────────────────────────────────────────────────
  const postulacionLines: string[] = [
    "-postular — Inicia el proceso de postulación al staff.",
  ];

  if (tier === 1) {
    postulacionLines.push(
      "-abrir postulaciones — Abre el período de postulaciones al staff.",
      "-cerrar postulaciones — Cierra el período de postulaciones al staff.",
    );
  }

  embed.addFields({
    name: "📋 Postulaciones",
    value: postulacionLines.join("\n"),
  });

  await interaction.reply({ embeds: [embed], ephemeral: false });
}
