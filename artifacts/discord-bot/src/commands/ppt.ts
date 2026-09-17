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
  // Discord no permite espacios en Slash Commands, así que va todo junto
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

// Función centralizada para Slash (/) y Prefix (-)
async function startPPTChallenge(
  guildId: string,
  challenger: { id: string },
  opponent: { id: string; bot: boolean },
  apuesta: number,
  rondas: number,
  replyMethod: {
    reply: (options: any) => Promise<any>;
    editReply: (options: any) => Promise<any>;
    fetchReply?: () => Promise<any>;
  }
) {
  if (opponent.bot || opponent.id === challenger.id) {
    await replyMethod.reply({ content: "❌ No puedes retar a un bot o a ti mismo.", ephemeral: true });
    return;
  }

  if (apuesta < APUESTA_MINIMA) {
    await replyMethod.reply({ content: `❌ La apuesta mínima es de **${APUESTA_MINIMA.toLocaleString()} Frijoles** (sin límite máximo).`, ephemeral: true });
    return;
  }

  if (typeof replyMethod.reply === "function" && !replyMethod.fetchReply) {
    await replyMethod.reply({ content: "⏳ Preparando el duelo de Piedra, Papel o Tijera..." });
  } else {
    await (replyMethod as ChatInputCommandInteraction).deferReply();
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
      if (typeof replyMethod.editReply === "function") {
        await replyMethod.editReply({ content: errorMsg });
      } else {
        await replyMethod.reply({ content: errorMsg });
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

    if (typeof replyMethod.editReply === "function" && replyMethod.fetchReply) {
      await replyMethod.editReply({ content: `<@${opponent.id}>`, embeds: [embed], components: [row] });
    } else {
      await replyMethod.reply({ content: `<@${opponent.id}>`, embeds: [embed], components: [row] });
    }
  } catch (err: any) {
    logger.error({ err }, "Error al iniciar duelo de PPT");
    const errMsg = `❌ Ocurrió un error: ${err?.message}`;
    if (typeof replyMethod.editReply === "function") {
      await replyMethod.editReply({ content: errMsg });
    } else {
      await replyMethod.reply({ content: errMsg });
    }
  }
}

// Ejecución para Slash Commands (/)
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) return;
  const challenger = interaction.user;
  const opponent = interaction.options.getUser("usuario", true);
  const apuesta = interaction.options.getInteger("apuesta", true);
  const rondas = interaction.options.getInteger("rondas", true);

  await startPPTChallenge(interaction.guildId, challenger, opponent, apuesta, rondas, {
    reply: (opts) => interaction.reply(opts),
    editReply: (opts) => interaction.editReply(opts),
    fetchReply: () => interaction.fetchReply(),
  });
}

// Ejecución para Prefix (-ppt @usuario apuesta rondas)
export async function run(message: Message, args: string[]): Promise<void> {
  if (!message.guildId) return;

  const opponent = message.mentions.users.first();
  const argsWithoutMentions = args.filter(arg => !arg.startsWith('<@'));

  const apuesta = parseInt(argsWithoutMentions[0], 10);
  const rondas = parseInt(argsWithoutMentions[1], 10);

  if (!opponent || isNaN(apuesta) || isNaN(rondas)) {
    await message.reply("❌ Uso correcto: `-ppt @usuario <apuesta> <rondas>`");
    return;
  }

  const loadingMessage = await message.reply("⏳ Procesando desafío...");

  await startPPTChallenge(message.guildId, message.author, opponent, apuesta, rondas, {
    reply: (opts) => loadingMessage.edit(opts),
    editReply: (opts) => loadingMessage.edit(opts),
  });
}

// Manejador de botones (Aquí agregaremos la lógica efímera y el Doble o Nada luego)
export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  if (interaction.customId.startsWith("ppt_accept_")) {
    await interaction.reply({ content: "🚀 ¡Sistema de juego en desarrollo! Se enviarán los menús efímeros pronto.", ephemeral: true });
  }
}