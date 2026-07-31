import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from "discord.js";

const ROLE_MODERADOR    = "Moderador [PB]";
const ROLE_HELPER       = "Helper";
const ROLE_TRIAL_HELPER = "Trial Helper";

type Tier = 1 | 2 | 3;

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

  const modRole  = guild.roles.cache.find((r) => r.name === ROLE_MODERADOR);
  const trialRole = guild.roles.cache.find((r) => r.name === ROLE_TRIAL_HELPER);
  const helperRole = guild.roles.cache.find((r) => r.name === ROLE_HELPER);

  if (modRole && highestPosition >= modRole.position) return 1;

  const tier2MinPosition = trialRole?.position ?? helperRole?.position;
  if (tier2MinPosition != null && highestPosition >= tier2MinPosition) return 2;

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
    .setColor("Orange")
    .setImage("https://i.postimg.cc/NftRNWyr/1783848277486.png")
    .setTimestamp();

  // ── 🎮 Partidas Ranked (everyone) ─────────────────────────────────────────
  embed.addFields({
    name: "🎮 Partidas Ranked",
    value: [
      "**/buscar partida** — Únete a la cola de búsqueda (requiere estar en un canal Among Us).",
      "**/partida estado** — Muestra el estado de tu partida activa.",
    ].join("\n"),
  });

  // ── 📊 Estadísticas (everyone) ────────────────────────────────────────────
  embed.addFields({
    name: "📊 Estadísticas",
    value: [
      "**/ranking** — Consulta el ranking de ELO de la temporada activa.",
      "**/perfil** — Muestra el perfil competitivo de un jugador.",
      "**/logros** — Muestra los logros de un jugador.",
    ].join("\n"),
  });

  // ── 👮 Supervisión (Tier 1 & 2 only) ─────────────────────────────────────
  if (tier <= 2) {
    embed.addFields({
      name: "👮 Supervisión",
      value: [
        "**/registrar partida** — Registra el código y mapa de la partida activa.",
        "**/finalizar partida** — Finaliza la partida, declara el ganador y envía el cuestionario.",
        "**/sala mute** — Silencia a todos en el canal de voz ranked.",
        "**/sala unmute** — Quita el silencio a todos en el canal de voz ranked.",
        "**/supervisor inactivo** — Solicita un supervisor de reemplazo para la partida activa.",
        "**/sanciones** — Consulta la información de una sanción.",
      ].join("\n"),
    });
  }

  // ── 🌟 Temporada (Tier 1 only) ────────────────────────────────────────────
  if (tier === 1) {
    embed.addFields({
      name: "🌟 Temporada",
      value: [
        "**/temporada abrir** — Abre una nueva temporada ranked.",
        "**/temporada cerrar** — Cierra la temporada activa.",
        "**/temporada info** — Muestra información sobre la temporada activa.",
      ].join("\n"),
    });
  }

  // ── 📋 Postulaciones ──────────────────────────────────────────────────────
  const postulacionLines: string[] = [
    "**/postular** — Inicia el proceso de postulación al rol de Trial Helper por DM.",
  ];

  if (tier === 1) {
    postulacionLines.push(
      "**/abrir-postulaciones** — Abre el período de postulaciones al staff.",
      "**/cerrar-postulaciones** — Cierra el período de postulaciones al staff.",
    );
  }

  embed.addFields({
    name: "📋 Postulaciones",
    value: postulacionLines.join("\n"),
  });

  // ── 💬 Comandos de Texto (everyone) ──────────────────────────────────────
  embed.addFields({
    name: "💬 Comandos de Texto",
    value: "**!curiosidad diaria** — Recibe un dato interesante que se actualiza cada 24 horas.",
  });

  await interaction.reply({ embeds: [embed], ephemeral: false });
}
