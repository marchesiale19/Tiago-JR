import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Muestra la lista de comandos disponibles.");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const { commands } = await import("./index");

  // Determine staff status via strict role-hierarchy check against "Moderador [PB]"
  const NOMBRE_ROL_STAFF = "Moderador [PB]";
  const role = interaction.guild?.roles.cache.find(r => r.name === NOMBRE_ROL_STAFF);
  const member = interaction.member;

  let esStaff = false;
  if (member && role && typeof member.permissions !== "string") {
    const highestRole = (member.roles as any).highest;
    // Admins always qualify; otherwise require role position >= Moderador [PB]
    esStaff =
      (member.permissions as any).has(PermissionFlagsBits.Administrator) ||
      highestRole.position >= role.position;
  }

  // Build category lists
  const categorias: Record<string, string[]> = {
    "📋 Postulaciones": [],
    "💬 Comandos de Texto": [],
  };

  // Slash commands — filter out staff-only entries for non-staff members
  commands.forEach((command: any) => {
    if (command.data.name === "help") return;
    if ((command.data as any).staffOnly === true && !esStaff) return;

    const cat = (command.data as any).category;

    if (cat === "Postulaciones" && categorias["📋 Postulaciones"]) {
      categorias["📋 Postulaciones"].push(
        `**/${command.data.name}**: ${command.data.description}`,
      );
    }
  });

  // Active text commands
  categorias["💬 Comandos de Texto"].push(
    "**!curiosidad diaria**: Recibe un dato interesante que se actualiza cada 24 horas.",
  );

  const embed = new EmbedBuilder()
    .setTitle("📖 Ayuda - TIAGO JR")
    .setColor("Orange")
    .setImage("https://i.postimg.cc/NftRNWyr/1783848277486.png")
    .setTimestamp();

  for (const [nombre, lista] of Object.entries(categorias)) {
    if (lista.length > 0) {
      embed.addFields({ name: nombre, value: lista.join("\n") });
    }
  }

  await interaction.reply({ embeds: [embed], ephemeral: false });
}
