import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  PermissionFlagsBits
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Muestra la lista de comandos disponibles.");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // Importante: importamos commands AQUI DENTRO para evitar el bucle circular
  const { commands } = await import("./index"); 

  // Definimos permisos una sola vez
  const esStaff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles);
  const listaComandos: any[] = [];

  // Clasificar comandos
  commands.forEach((command: any) => {
    const name = command.data.name;

    // 1. Ignoramos el comando "help"
    if (name === "help") return;

    // 2. Filtramos: Si es de staff, solo lo agregamos si el usuario tiene permiso.
    if (command.data.staffOnly === true) {
      if (esStaff) listaComandos.push(command);
    } else {
      listaComandos.push(command);
    }
  });

  // --- CONSTRUCCIÓN DEL EMBED ---
  const embed = new EmbedBuilder()
    .setTitle("📖 Ayuda - TIAGO JR")
    .setColor("Orange")
    .setDescription("Comandos disponibles para tu rango")
    .setImage("https://i.postimg.cc/NftRNWyr/1783848277486.png")
    .setTimestamp();

  // 3. Añadimos TODO a la única categoría "Postulaciones"
  if (listaComandos.length > 0) {
    embed.addFields({ 
      name: "📋 Postulaciones", 
      value: listaComandos.map(c => `**/${c.data.name}**: ${c.data.description}`).join("\n") 
    });
  }

  await interaction.reply({ embeds: [embed], ephemeral: false });
}
