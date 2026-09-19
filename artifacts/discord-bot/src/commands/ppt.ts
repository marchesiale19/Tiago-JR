import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type Message,
} from "discord.js";
import pkg from "unb-api";
const { Client: UnbClient } = pkg;
import { logger } from "../lib/logger";

const unb = new UnbClient(process.env.UNBELIEVABOAT_API_KEY as string);

const APUESTA_MINIMA = 10000;

export const data = new SlashCommandBuilder()
  .setName("piedrapapeltijera") 
  .setDescription("Juega un 1v1 de Piedra, Papel o Tijera apostando frijoles.")
  .addUserOption((option) =>
    option
      .setName("usuario")
      .setDescription("Usuario al que quieres retar")
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("apuesta")
      .setDescription(`Cantidad a apostar (Mínimo ${APUESTA_MINIMA.toLocaleString()} - Sin límite máximo)`)
      .setMinValue(APUESTA_MINIMA)
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("rondas")
      .setDescription("Cantidad de rondas para ganar (ej: 1, 3, 5)")
      .setMinValue(1)
      .setRequired(true),
  );

async function startPPTChallenge(
  guildId: string,
  challenger: { id: string },
  opponent: { id: string; bot: boolean },
  apuesta: number,
  rondas: number,
  channel: any,
  isSlash: boolean,
  interaction?: ChatInputCommandInteraction
) {
  if (opponent.bot || opponent.id === challenger.id) {
    const content = "❌ No puedes retar a un bot o a ti mismo.";
    if (isSlash && interaction) {
      await interaction.reply({ content, ephemeral: true });
    } else {
      await channel.send({ content });
    }
    return;
  }

  if (apuesta < APUESTA_MINIMA) {
    const content = `❌ La apuesta mínima es de **${APUESTA_MINIMA.toLocaleString()} Frijoles** (sin límite máximo).`;
    if (isSlash && interaction) {
      await interaction.reply({ content, ephemeral: true });
    } else {
      await channel.send({ content });
    }
    return;
  }

  if (isSlash && interaction) {
    await interaction.deferReply();
  }

  try {
    const [balChallenger, balOpponent] = await Promise.all([
      unb.getUserBalance(guildId, challenger.id),
      unb.getUserBalance(guildId, opponent.id),
    ]);

    const cashChallenger = balChallenger.cash || 0;
    const cashOpponent = balOpponent.cash || 0;

    const errorMsg = cashChallenger < apuesta
      ? `❌ No tienes suficientes frijoles para esta apuesta.`
      : cashOpponent < apuesta
      ? `❌ El usuario <@${opponent.id}> no tiene suficientes frijoles para igualar tu apuesta de **${apuesta.toLocaleString()}**.`
      : null;

    if (errorMsg) {
      if (isSlash && interaction) {
        await interaction.editReply({ content: errorMsg });
      } else {
        await channel.send({ content: errorMsg });
      }
      return;
    }

    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle("✊ 📄 ✂️ ¡Duelo de Piedra, Papel o Tijera!")
      .setDescription(`<@${opponent.id}>, has sido retado por <@${challenger.id}>.\n\n💰 **Apuesta en juego:** \`${apuesta.toLocaleString()} Frijoles\`\n🔄 **Rondas para ganar:** \`${rondas}\`\n\n*Al aceptar, se retendrá el pozo inicial de ambos jugadores.*\n⏳ Tienes 5 minutos para aceptar.`);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ppt_accept_${challenger.id}_${opponent.id}_${apuesta}_${rondas}`)
        .setLabel("Aceptar Duelo")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ppt_reject_${challenger.id}_${opponent.id}`)
        .setLabel("Rechazar")
        .setStyle(ButtonStyle.Danger),
    );

    const payload = { content: `<@${opponent.id}>`, embeds: [embed], components: [row] };

    if (isSlash && interaction) {
      await interaction.editReply(payload);
    } else {
      await channel.send(payload);
    }
  } catch (err: any) {
    logger.error({ err }, "Error al iniciar duelo de PPT");
    const errMsg = `❌ Ocurrió un error: ${err?.message}`;
    if (isSlash && interaction) {
      await interaction.editReply({ content: errMsg });
    } else {
      await channel.send({ content: errMsg });
    }
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) return;
  const challenger = interaction.user;
  const opponent = interaction.options.getUser("usuario", true);
  const apuesta = interaction.options.getInteger("apuesta", true);
  const rondas = interaction.options.getInteger("rondas", true);

  await startPPTChallenge(interaction.guildId, challenger, opponent, apuesta, rondas, interaction.channel, true, interaction);
}

export async function run(message: Message, args: string[]): Promise<void> {
  if (!message.guildId) return;

  const opponent = message.mentions.users.first();

  // Limpiamos los argumentos excluyendo la mención para extraer apuesta y rondas de forma segura
  const cleanArgs = args.filter(arg => !arg.includes(opponent?.id ?? ""));
  const apuesta = parseInt(cleanArgs[0], 10);
  const rondas = parseInt(cleanArgs[1], 10);

  if (!opponent || isNaN(apuesta) || isNaN(rondas)) {
    await message.reply("❌ Uso correcto: `-ppt @usuario <apuesta> <rondas>`");
    return;
  }

  await startPPTChallenge(message.guildId, message.author, opponent, apuesta, rondas, message.channel, false);
}

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  if (interaction.customId.startsWith("ppt_accept_")) {
    await interaction.reply({ content: "🚀 ¡Sistema de juego en desarrollo! Se enviarán los menús efímeros pronto.", ephemeral: true });
  }
}