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

interface TatetiGame {
  p1: string; // ID del Retador (Cruz ❌)
  p2: string; // ID del Retado (Círculo ⭕)
  apuesta: number;
  board: string[]; // 25 posiciones ("" | "X" | "O")
  turn: string; // ID del jugador actual
  inactivityTimeout?: NodeJS.Timeout;
}

const activeGames = new Map<string, TatetiGame>();

export const data = new SlashCommandBuilder()
  .setName("tateti")
  .setDescription("Juega un 5x5 de Ta-Te-Ti apostando frijoles contra otro usuario.")
  .addUserOption((option) =>
    option
      .setName("usuario")
      .setDescription("Usuario al que quieres retar")
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("apuesta")
      .setDescription("Cantidad de frijoles a apostar")
      .setMinValue(1)
      .setRequired(true),
  );

// Función centralizada para iniciar el duelo (reutilizable para Slash y Prefix)
async function startTatetiChallenge(
  guildId: string,
  challenger: { id: string },
  opponent: { id: string; bot: boolean },
  apuesta: number,
  replyMethod: {
    reply: (options: any) => Promise<any>;
    editReply: (options: any) => Promise<any>;
    fetchReply?: () => Promise<any>;
  }
): Promise<void> {
  if (opponent.bot || opponent.id === challenger.id) {
    await replyMethod.reply({ content: "❌ No puedes retar a un bot o a ti mismo.", ephemeral: true });
    return;
  }

  if (apuesta <= 0) {
    await replyMethod.reply({ content: "❌ La apuesta debe ser mayor a 0 frijoles.", ephemeral: true });
    return;
  }

  if (typeof replyMethod.reply === "function" && !replyMethod.fetchReply) {
    await replyMethod.reply({ content: "⏳ Verificando saldos y preparando desafío..." });
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
      ? `❌ No tienes suficientes frijoles. Tienes **${cashChallenger.toLocaleString()}** frijoles en efectivo.`
      : cashOpponent < apuesta
      ? `❌ El usuario <@${opponent.id}> no tiene suficientes frijoles (necesita **${apuesta.toLocaleString()}**).`
      : null;

    if (errorMsg) {
      if (typeof replyMethod.editReply === "function") {
        await replyMethod.editReply({ content: errorMsg });
      } else {
        await replyMethod.reply({ content: errorMsg });
      }
      return;
    }

    const challengeEmbed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle("⚔️ ¡Desafío de Ta-Te-Ti 5x5!")
      .setDescription(`<@${opponent.id}>, has sido retado por <@${challenger.id}> a un duelo de Ta-Te-Ti.\n\n💰 **Apuesta en juego:** \`${apuesta.toLocaleString()} Frijoles\`\n⏳ **Tiempo límite:** 10 minutos para aceptar.`)
      .setFooter({ text: "Ta-Te-Ti 5x5 • Apuestas 1v1" })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tateti_accept_${challenger.id}_${opponent.id}_${apuesta}`)
        .setLabel("Aceptar Desafío")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`tateti_reject_${challenger.id}_${opponent.id}`)
        .setLabel("Rechazar")
        .setStyle(ButtonStyle.Danger),
    );

    let sentMessage: any;
    if (typeof replyMethod.editReply === "function" && replyMethod.fetchReply) {
      sentMessage = await replyMethod.editReply({
        content: `<@${opponent.id}>`,
        embeds: [challengeEmbed],
        components: [row],
      });
    } else {
      sentMessage = await replyMethod.reply({
        content: `<@${opponent.id}>`,
        embeds: [challengeEmbed],
        components: [row],
      });
    }

    setTimeout(async () => {
      try {
        if (sentMessage && typeof sentMessage.fetch === "function") {
          const fetchedMsg = await sentMessage.fetch();
          if (fetchedMsg.components.length > 0) {
            const expiredEmbed = new EmbedBuilder()
              .setColor("Grey")
              .setTitle("⌛ Desafío Expirado")
              .setDescription("El tiempo para aceptar el desafío de Ta-Te-Ti ha expirado.");
            await sentMessage.edit({ embeds: [expiredEmbed], components: [] });
          }
        }
      } catch {}
    }, 10 * 60 * 1000);

  } catch (err: any) {
    logger.error({ err }, "Error al iniciar el reto de tateti");
    const errMsg = `❌ Ocurrió un error al procesar el desafío: \`${err?.message || "Error desconocido"}\``;
    if (typeof replyMethod.editReply === "function") {
      await replyMethod.editReply({ content: errMsg });
    } else {
      await replyMethod.reply({ content: errMsg });
    }
  }
}

// Ejecución para Slash Commands (/)
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "Este comando solo se usa en servidores.", ephemeral: true });
    return;
  }

  const challenger = interaction.user;
  const opponent = interaction.options.getUser("usuario", true);
  const apuesta = interaction.options.getInteger("apuesta", true);

  await startTatetiChallenge(interaction.guildId, challenger, opponent, apuesta, {
    reply: (opts) => interaction.reply(opts),
    editReply: (opts) => interaction.editReply(opts),
    fetchReply: () => interaction.fetchReply(),
  });
}

// Ejecución para Prefijo tradicional corregida (-tateti @usuario cantidad)
export async function run(message: Message, args: string[]): Promise<void> {
  if (!message.guildId || !message.guild) {
    await message.reply("Este comando solo se usa en servidores.");
    return;
  }

  const opponent = message.mentions.users.first();
  const apuestaStr = args.find((arg) => !arg.startsWith("<@") && !isNaN(Number(arg)));

  if (!opponent || !apuestaStr) {
    await message.reply("❌ Uso correcto: `-tateti @usuario <cantidad>`");
    return;
  }

  const apuesta = parseInt(apuestaStr, 10);

  // El bot crea y guarda su propio mensaje para editarlo de forma segura
  const loadingMessage = await message.reply("⏳ Verificando saldos y preparando desafío...");

  await startTatetiChallenge(message.guildId, message.author, opponent, apuesta, {
    reply: (opts) => loadingMessage.edit(opts),
    editReply: (opts) => loadingMessage.edit(opts),
  });
}

function checkWin(board: string[], playerChar: string): boolean {
  const size = 5;
  const winLength = 4;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - winLength; c++) {
      let win = true;
      for (let i = 0; i < winLength; i++) {
        if (board[r * size + (c + i)] !== playerChar) {
          win = false;
          break;
        }
      }
      if (win) return true;
    }
  }

  for (let c = 0; c < size; c++) {
    for (let r = 0; r <= size - winLength; r++) {
      let win = true;
      for (let i = 0; i < winLength; i++) {
        if (board[(r + i) * size + c] !== playerChar) {
          win = false;
          break;
        }
      }
      if (win) return true;
    }
  }

  for (let r = 0; r <= size - winLength; r++) {
    for (let c = 0; c <= size - winLength; c++) {
      let win = true;
      for (let i = 0; i < winLength; i++) {
        if (board[(r + i) * size + (c + i)] !== playerChar) {
          win = false;
          break;
        }
      }
      if (win) return true;
    }
  }

  for (let r = 0; r <= size - winLength; r++) {
    for (let c = winLength - 1; c < size; c++) {
      let win = true;
      for (let i = 0; i < winLength; i++) {
        if (board[(r + i) * size + (c - i)] !== playerChar) {
          win = false;
          break;
        }
      }
      if (win) return true;
    }
  }

  return false;
}

function setupInactivityTimeout(gameId: string, interactionOrMessage: ButtonInteraction) {
  const game = activeGames.get(gameId);
  if (!game) return;

  if (game.inactivityTimeout) {
    clearTimeout(game.inactivityTimeout);
  }

  game.inactivityTimeout = setTimeout(async () => {
    const currentGame = activeGames.get(gameId);
    if (!currentGame) return;

    try {
      await Promise.all([
        unb.editUserBalance(interactionOrMessage.guildId!, currentGame.p1, { cash: currentGame.apuesta }),
        unb.editUserBalance(interactionOrMessage.guildId!, currentGame.p2, { cash: currentGame.apuesta }),
      ]);

      const timeoutEmbed = new EmbedBuilder()
        .setColor("Grey")
        .setTitle("⌛ Partida Expirada por Inactividad")
        .setDescription("Han pasado 10 minutos sin actividad en la partida.\n\n💸 **Se han devuelto las apuestas** intactas a ambos jugadores.");

      activeGames.delete(gameId);

      await interactionOrMessage.message.edit({
        embeds: [timeoutEmbed],
        components: buildBoardComponents(currentGame, gameId, true),
      });
    } catch (err) {
      logger.error({ err }, "Error al expirar partida de tateti por inactividad");
      activeGames.delete(gameId);
    }
  }, 10 * 60 * 1000);
}

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  if (customId.startsWith("tateti_accept_")) {
    const parts = customId.split("_");
    const p1 = parts[2];
    const p2 = parts[3];
    const apuesta = parseInt(parts[4], 10);

    if (interaction.user.id !== p2) {
      await interaction.reply({ content: "❌ Solo el usuario retado puede aceptar este desafío.", ephemeral: true });
      return;
    }

    await interaction.update({ content: "⏳ Preparando tablero...", embeds: [], components: [] });

    try {
      await Promise.all([
        unb.editUserBalance(interaction.guildId!, p1, { cash: -apuesta }),
        unb.editUserBalance(interaction.guildId!, p2, { cash: -apuesta }),
      ]);

      const game: TatetiGame = {
        p1,
        p2,
        apuesta,
        board: Array(25).fill(""),
        turn: Math.random() < 0.5 ? p1 : p2,
      };

      const gameId = interaction.message.id;
      activeGames.set(gameId, game);

      setupInactivityTimeout(gameId, interaction);

      await updateBoardMessage(interaction, game, gameId);
    } catch (err: any) {
      await interaction.followUp({ content: `❌ Error al descontar los fondos para la apuesta: ${err?.message}`, ephemeral: true });
    }
  } else if (customId.startsWith("tateti_reject_")) {
    const parts = customId.split("_");
    const p2 = parts[3];

    if (interaction.user.id !== p2) {
      await interaction.reply({ content: "❌ No puedes rechazar un desafío que no va dirigido a ti.", ephemeral: true });
      return;
    }

    await interaction.update({
      content: "❌ El desafío ha sido rechazado.",
      embeds: [],
      components: [],
    });
  } else if (customId.startsWith("tateti_move_")) {
    const parts = customId.split("_");
    const gameId = parts[2];
    const index = parseInt(parts[3], 10);

    const game = activeGames.get(gameId);
    if (!game) {
      await interaction.reply({ content: "❌ Esta partida ha expirado por inactividad o ya ha finalizado.", ephemeral: true });
      return;
    }

    if (interaction.user.id !== game.turn) {
      await interaction.reply({ content: "❌ No es tu turno.", ephemeral: true });
      return;
    }

    if (game.board[index] !== "") {
      await interaction.reply({ content: "❌ Esta casilla ya está ocupada.", ephemeral: true });
      return;
    }

    await interaction.deferUpdate();

    const symbol = interaction.user.id === game.p1 ? "❌" : "⭕";
    game.board[index] = symbol;

    if (checkWin(game.board, symbol)) {
      if (game.inactivityTimeout) clearTimeout(game.inactivityTimeout);

      const winnerId = interaction.user.id;
      const totalPozo = game.apuesta * 2;

      await unb.editUserBalance(interaction.guildId!, winnerId, { cash: totalPozo });

      const winEmbed = new EmbedBuilder()
        .setColor("Green")
        .setTitle("🎉 ¡Partida Finalizada - Victoria!")
        .setDescription(`¡<@${winnerId}> ha ganado la partida haciendo línea de 4!\n\n💰 Se lleva el pozo de **${totalPozo.toLocaleString()} Frijoles**.`);

      activeGames.delete(gameId);
      await interaction.editReply({ embeds: [winEmbed], components: buildBoardComponents(game, gameId, true) });
      return;
    }

    if (game.board.every((cell) => cell !== "")) {
      if (game.inactivityTimeout) clearTimeout(game.inactivityTimeout);

      await Promise.all([
        unb.editUserBalance(interaction.guildId!, game.p1, { cash: game.apuesta }),
        unb.editUserBalance(interaction.guildId!, game.p2, { cash: game.apuesta }),
      ]);

      const drawEmbed = new EmbedBuilder()
        .setColor("Yellow")
        .setTitle("🤝 ¡Empate!")
        .setDescription("El tablero se llenó y nadie logró hacer línea de 4.\n\n💸 Se han devuelto las apuestas intactas a ambos jugadores.");

      activeGames.delete(gameId);
      await interaction.editReply({ embeds: [drawEmbed], components: buildBoardComponents(game, gameId, true) });
      return;
    }

    game.turn = game.turn === game.p1 ? game.p2 : game.p1;
    setupInactivityTimeout(gameId, interaction);

    await updateBoardMessage(interaction, game, gameId);
  }
}

function buildBoardComponents(game: TatetiGame, gameId: string, disabled: boolean = false) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let r = 0; r < 5; r++) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let c = 0; c < 5; c++) {
      const index = r * 5 + c;
      const val = game.board[index];

      let style = ButtonStyle.Secondary;
      if (val === "❌") style = ButtonStyle.Primary;
      if (val === "⭕") style = ButtonStyle.Danger;

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`tateti_move_${gameId}_${index}`)
          .setLabel(val === "" ? "\u200b" : val)
          .setStyle(style)
          .setDisabled(disabled || val !== ""),
      );
    }
    rows.push(row);
  }

  return rows;
}

async function updateBoardMessage(interaction: ButtonInteraction, game: TatetiGame, gameId: string) {
  const embed = new EmbedBuilder()
    .setColor("Orange")
    .setTitle("⭕ Ta-Te-Ti 5x5 (Línea de 4) ❌")
    .setDescription(`Turno actual: <@${game.turn}> (${game.turn === game.p1 ? "❌" : "⭕"})\n\n• **Jugador 1 (❌):** <@${game.p1}>\n• **Jugador 2 (⭕):** <@${game.p2}>\n• **Pozo en juego:** \`${(game.apuesta * 2).toLocaleString()} Frijoles\``);

  await interaction.editReply({
    embeds: [embed],
    components: buildBoardComponents(game, gameId, false),
  });
}