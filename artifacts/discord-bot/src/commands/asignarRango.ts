import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { setSimulatedLevel, MY_DISCORD_ID } from "./roleOverride";

export const data = new SlashCommandBuilder()
  .setName("asignarrango")
  .setDescription("Simula un rango numérico para probar el comando help.")
  .addIntegerOption(option =>
    option.setName("numero")
      .setDescription("1: user, 2: staff, 3: owner (0 para desactivar)")
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.user.id !== MY_DISCORD_ID) {
    await interaction.reply({ content: "❌ No tienes permiso para usar este comando.", ephemeral: true });
    return;
  }

  const numero = interaction.options.getInteger("numero", true);

  if (numero <= 0) {
    setSimulatedLevel(null);
    await interaction.reply({ content: "🔄 Simulación desactivada.", ephemeral: true });
  } else {
    setSimulatedLevel(numero);
    await interaction.reply({ content: `✅ Ahora estás simulando el **Rango ${numero}**. Prueba usar \`-help\`.`, ephemeral: true });
  }
}

export async function run(message: any, args: string[]): Promise<void> {
  if (message.author.id !== MY_DISCORD_ID) {
    await message.reply("❌ No tienes permiso para usar este comando.");
    return;
  }

  const numero = parseInt(args[0]);

  if (isNaN(numero)) {
    await message.reply("❌ Uso correcto: `-asignar rango [número]` (Ej: `-asignar rango 2`, o `0` para apagar).");
    return;
  }

  if (numero <= 0) {
    setSimulatedLevel(null);
    await message.reply("🔄 Simulación desactivada. Volviendo a la normalidad.");
  } else {
    setSimulatedLevel(numero);
    await message.reply(`✅ Ahora estás simulando el **Rango ${numero}**. Prueba usar \`-help\`.`);
  }
}