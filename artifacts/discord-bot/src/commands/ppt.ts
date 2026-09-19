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
      .setDescription("Cantidad a apostar (Sin límites)")
      .setMinValue(0)
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("rondas")
      .setDescription("Cantidad de rondas para ganar (ej: 1, 3, 5)")
      .setMinValue(1)
      .setRequired(true),
  );

function getRoundWinner(choice1: string, choice2: string): number {
  if (choice1 === choice2) return 0; // Empate
  if (
    (choice1 === "rock" && choice2 === "scissors") ||
    (choice1 === "paper" && choice2 === "rock") ||
    (choice1 === "scissors" && choice2 === "paper")
  ) {
    return 1; // Gana jugador 1
  }
  return 2; // Gana jugador 2
}

async function startPPTChallenge(
  guildId: string,
  challenger: { id: string; toString(): string },
  opponent: { id: string; bot: boolean; toString(): string },
  apuesta: number,
  rondasObjetivo: number,
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
      ? `❌ El usuario ${opponent.toString()} no tiene suficientes frijoles para igualar tu apuesta de **${apuesta.toLocaleString()}**.`
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
      .setColor("Orange")
      .setTitle("✊ 📄 ✂️ ¡Duelo de Piedra, Papel o Tijera!")
      .setDescription(`${opponent.toString()}, has sido retado por${challenger.toString()}.\n\n💰 **Apuesta en juego:** \`${apuesta.toLocaleString()} Frijoles\`\n🔄 **Rondas para ganar:** \`${rondasObjetivo}\`\n\n*El ganador se lleva el pozo total.* \n⏳ Tienes 10 minutos para aceptar.`);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ppt_accept_${challenger.id}_${opponent.id}_${apuesta}_${rondasObjetivo}`)
        .setLabel("Aceptar Duelo")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ppt_reject_${challenger.id}_${opponent.id}`)
        .setLabel("Rechazar")
        .setStyle(ButtonStyle.Danger),
    );

    const payload = { content: opponent.toString(), embeds: [embed], components: [row] };

    const sentMessage = isSlash && interaction
      ? await interaction.editReply(payload)
      : await channel.send(payload);

    const collector = sentMessage.createMessageComponentCollector({
      time: 10 * 60 * 1000,
    });

    collector.on("collect", async (i: ButtonInteraction) => {
      const parts = i.customId.split("_");
      const action = parts[1];
      const targetChallengerId = parts[2];
      const targetOpponentId = parts[3];

      if (action === "reject") {
        if (i.user.id !== targetOpponentId && i.user.id !== targetChallengerId) {
          await i.reply({ content: "❌ No puedes rechazar este duelo.", ephemeral: true });
          return;
        }
        await i.update({
          content: `❌ El duelo fue rechazado por ${i.user.toString()}.`,
          embeds: [],
          components: [],
        });
        collector.stop("rejected");
        return;
      }

      if (action === "accept") {
        if (i.user.id !== targetOpponentId) {
          await i.reply({ content: "❌ Solo el usuario retado puede aceptar el duelo.", ephemeral: true });
          return;
        }

        collector.stop("accepted");

        const [checkC, checkO] = await Promise.all([
          unb.getUserBalance(guildId, targetChallengerId),
          unb.getUserBalance(guildId, targetOpponentId),
        ]);

        if ((checkC.cash || 0) < apuesta || (checkO.cash || 0) < apuesta) {
          await i.update({
            content: "❌ Uno de los jugadores ya no tiene suficientes fondos para cubrir la apuesta.",
            embeds: [],
            components: [],
          });
          return;
        }

        await runGameSession(i, channel, guildId, targetChallengerId, targetOpponentId, apuesta, rondasObjetivo, sentMessage);
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason === "time") {
        try {
          const expiredEmbed = EmbedBuilder.from(embed)
            .setColor("Grey")
            .setDescription(`⏱️ **Este duelo ha expirado.** Nadie aceptó la invitación en el tiempo límite de 10 minutos.`);

          await sentMessage.edit({
            embeds: [expiredEmbed],
            components: [],
          });
        } catch (err) {
          logger.error({ err }, "Error al expirar el mensaje de PPT");
        }
      }
    });

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

async function runGameSession(
  initialInteraction: ButtonInteraction,
  channel: any,
  guildId: string,
  challengerId: string,
  opponentId: string,
  apuesta: number,
  rondasObjetivo: number,
  gameMessage: Message
) {
  let challengerScore = 0;
  let opponentScore = 0;
  let roundNumber = 1;

  await initialInteraction.update({
    content: `🎮 ¡Duelo en curso entre <@${challengerId}> y <@${opponentId}>!`,
    embeds: [
      new EmbedBuilder()
        .setColor("Blue")
        .setTitle("✊ 📄 ✂️ Duelo en Progreso")
        .setDescription(`Marcador actual:\n<@${challengerId}>: **${challengerScore}** | <@${opponentId}>: **${opponentScore}**\n\n*Rondas necesarias para ganar:* \`${rondasObjetivo}\``)
    ],
    components: [],
  });

  while (challengerScore < rondasObjetivo && opponentScore < rondasObjetivo) {
    const roundEmbed = new EmbedBuilder()
      .setColor("Yellow")
      .setTitle(`⚔️ Ronda #${roundNumber}`)
      .setDescription("¡Elige tu jugada en los botones de abajo! Tienes **30 segundos**.\n*Tu elección es secreta y no se puede cambiar.*");

    const playRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ppt_play_rock_${roundNumber}`).setLabel("Piedra 🪨").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ppt_play_paper_${roundNumber}`).setLabel("Papel 📄").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ppt_play_scissors_${roundNumber}`).setLabel("Tijera ✂️").setStyle(ButtonStyle.Primary)
    );

    const roundMsg = await channel.send({
      content: `<@${challengerId}> y <@${opponentId}>, revisen sus opciones.`,
      embeds: [roundEmbed],
      components: [playRow],
    });

    let challengerChoice: string | null = null;
    let opponentChoice: string | null = null;

    const roundCollector = roundMsg.createMessageComponentCollector({
      time: 30 * 1000,
    });

    roundCollector.on("collect", async (i: ButtonInteraction) => {
      if (i.user.id !== challengerId && i.user.id !== opponentId) {
        await i.reply({ content: "❌ No eres parte de este duelo.", ephemeral: true });
        return;
      }

      const choice = i.customId.split("_")[2];

      if (i.user.id === challengerId) {
        if (challengerChoice) {
          await i.reply({ content: "❌ Ya elegiste tu jugada para esta ronda y no puedes cambiarla.", ephemeral: true });
          return;
        }
        challengerChoice = choice;
        await i.reply({ content: `✅ Elegiste **${choice.toUpperCase()}**. Esperando al oponente...`, ephemeral: true });
      } else if (i.user.id === opponentId) {
        if (opponentChoice) {
          await i.reply({ content: "❌ Ya elegiste tu jugada para esta ronda y no puedes cambiarla.", ephemeral: true });
          return;
        }
        opponentChoice = choice;
        await i.reply({ content: `✅ Elegiste **${choice.toUpperCase()}**. Esperando al retador...`, ephemeral: true });
      }

      if (challengerChoice && opponentChoice) {
        roundCollector.stop("finished");
      }
    });

    await new Promise((resolve) => {
      roundCollector.on("end", resolve);
    });

    try {
      await roundMsg.delete().catch(() => {});
    } catch {}

    if (!challengerChoice || !opponentChoice) {
      await channel.send({
        content: `⏱️ El tiempo de la ronda expiró porque uno de los jugadores no eligió. ¡Duelo cancelado!`,
      });
      return;
    }

    const winner = getRoundWinner(challengerChoice, opponentChoice);
    let roundResultText = "";
    const emojiMap: Record<string, string> = { rock: "🪨 Piedra", paper: "📄 Papel", scissors: "✂️ Tijera" };

    if (winner === 1) {
      challengerScore++;
      roundResultText = `🏆 ¡Punto para <@${challengerId}>! (${emojiMap[challengerChoice]} vs ${emojiMap[opponentChoice]})`;
    } else if (winner === 2) {
      opponentScore++;
      roundResultText = `🏆 ¡Punto para <@${opponentId}>! (${emojiMap[opponentChoice]} vs ${emojiMap[challengerChoice]})`;
    } else {
      roundResultText = `🤝 ¡Empate en esta ronda! Ambos sacaron ${emojiMap[challengerChoice]}. Se repetirá.`;
    }

    await channel.send({
      content: `📊 **Resultado de la Ronda ${roundNumber}:**\n${roundResultText}\n\nMarcador parcial: <@${challengerId}> (**${challengerScore}**) - <@${opponentId}> (**${opponentScore}**)`,
    });

    if (winner !== 0) {
      roundNumber++;
    }
  }

  const totalWinnerId = challengerScore > opponentScore ? challengerId : opponentId;
  const totalLoserId = challengerScore > opponentScore ? opponentId : challengerId;

  try {
    const pozoTotal = apuesta * 2;
    await unb.editUserBalance(guildId, totalLoserId, { cash: -apuesta });
    await unb.editUserBalance(guildId, totalWinnerId, { cash: apuesta });

    const finalEmbed = new EmbedBuilder()
      .setColor("Green")
      .setTitle("👑 ¡Fin del Duelo de Piedra, Papel o Tijera!")
      .setDescription(`¡El gran ganador del duelo es <@${totalWinnerId}>!\n\n💰 **Pozo entregado:** \`${pozoTotal.toLocaleString()} Frijoles\`\n📊 **Marcador final:** ${challengerScore} - ${opponentScore}`);

    await channel.send({ embeds: [finalEmbed] });
  } catch (err) {
    logger.error({ err }, "Error al transferir los frijoles en el duelo de PPT");
    await channel.send({ content: "⚠️ Hubo un error al procesar la transferencia de los frijoles con UnbelievableBoat." });
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

  const cleanArgs = args.filter(arg => !arg.includes(opponent?.id ?? ""));
  const apuesta = parseInt(cleanArgs[0], 10);
  const rondas = parseInt(cleanArgs[1], 10);

  if (!opponent || isNaN(apuesta) || isNaN(rondas)) {
    await message.reply("❌ Uso correcto: `-ppt @usuario <apuesta> <rondas>`");
    return;
  }

  await startPPTChallenge(message.guildId, message.author, opponent, apuesta, rondas, message.channel, false);
}

export async function handleButton(_interaction: ButtonInteraction): Promise<void> {}
