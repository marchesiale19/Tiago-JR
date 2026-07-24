import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from "discord.js";

const ROLE_MODERADOR = "Moderador [PB]";
const ROLE_HELPER = "Helper";
const ROLE_TRIAL_HELPER = "Trial Helper";

type Tier = 1 | 2 | 3;

function getUserTier(interaction: ChatInputCommandInteraction): Tier {
  const guild = interaction.guild;
  const member = interaction.member;

  if (!guild || !member || typeof member === "string") return 3;
  if (!("roles" in member) || typeof member.roles === "string") return 3;

  const memberRolesCache = (member.roles as any).cache;
  if (!memberRolesCache) return 3;

  const highestPosition: number = Math.max(
    0,
    ...memberRolesCache.map((r: any) => r.position as number),
  );

  const modRole = guild.roles.cache.find((r) => r.name === ROLE_MODERADOR);
  const helperRole = guild.roles.cache.find((r) => r.name === ROLE_HELPER);
  const trialRole = guild.roles.cache.find(
    (r) => r.name === ROLE_TRIAL_HELPER,
  );

  if (modRole && highestPosition >= modRole.position) return 1;

  // Tier 2: Helper or Trial Helper (at least Trial Helper level)
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
  // Fetch roles so position data is available
  if (interaction.guild) {
    await interaction.guild.roles.fetch();
  }

  const tier = getUserTier(interaction);

  const embed = new EmbedBuilder()
    .setTitle("📖 Ayuda - TIAGO JR")
    .setColor("Orange")
    .setImage("https://i.postimg.cc/NftRNWyr/1783848277486.png")
    .setTimestamp();

  // ── 👑 Administración (Tier 1 & 2 only) ──────────────────────────────────
  if (tier <= 2) {
    embed.addFields({
      name: "👑 Administración",
      value: "**/sanciones**: Consulta la información de una sanción.",
    });
  }

  // ── 📋 Postulaciones ──────────────────────────────────────────────────────
  const postulacionLines: string[] = [
    "**/postular**: Inicia el proceso de postulación al rol de Trial Helper por mensaje directo (DM).",
  ];

  if (tier === 1) {
    // Full staff menu: also show open/close commands
    postulacionLines.push(
      "**/abrir-postulaciones**: Abre el período de postulaciones al staff.",
      "**/cerrar-postulaciones**: Cierra el período de postulaciones al staff.",
    );
  }

  embed.addFields({
    name: "📋 Postulaciones",
    value: postulacionLines.join("\n"),
  });

  // ── 💬 Comandos de Texto (everyone) ──────────────────────────────────────
  embed.addFields({
    name: "💬 Comandos de Texto",
    value: "**!curiosidad diaria**: Recibe un dato interesante que se actualiza cada 24 horas.",
  });

  await interaction.reply({ embeds: [embed], ephemeral: false });
}
