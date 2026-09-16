import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
} from "discord.js";
import pkg from "unb-api";
const { Client: UnbClient } = pkg;
import { logger } from "../lib/logger";

const unb = new UnbClient(process.env.UNBELIEVABOAT_API_KEY as string);

// Interfaz para el estado de la partida
interface TatetiGame {
  p1: string; // ID del Retador (Cruz ❌)
  p2: string; // ID del Retado (Círculo ⭕)
  apuesta: number;
  board: string[]; // 25 posiciones ("" | "X" | "O")
  turn: string; // ID del jugador actual
  messageId?: string;
  timeout?: NodeJS.Timeout;
}

// Mapa global activo de partidas en curso (guildId-channelId o sessionId)
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
      .setDescription("Cantidad de frijoles a apostar (Máx. 50,000)")
      .setMinValue(100)
      .setMaxValue(50000)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "Este comando solo se usa en servidores.", ephemeral: true });
    return;
  }

  const challenger = interaction.user;
  const opponent = interaction.options.getUser("usuario", true);
  const apuesta = interaction.options.getInteger("apuesta", true);

  // Validaciones iniciales
  if (opponent.bot || opponent.id === challenger.id) {
    await interaction.reply({ content: "❌ No puedes retar a un bot o a ti mismo.", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    // 1. Validar saldos usando UnbelievaBoat
    const [balChallenger, balOpponent] = await Promise.all([
      unb.getUserBalance(interaction.guildId, challenger.id),
      unb.getUserBalance(interaction.guildId, opponent.id),
    ]);

    const cashChallenger = balChallenger.cash || 0;
    const cashOpponent = balOpponent.cash || 0;

    if (cashChallenger < apuesta) {
      await interaction.editReply({ content: `❌ No tienes suficientes frijoles. Tienes **${cashChallenger.toLocaleString()}** frijoles en efectivo.` });
      return;
    }

    if (cashOpponent < apuesta) {
      await interaction.editReply({ content: `❌ El usuario <@${opponent.id}> no tiene suficientes frijoles (necesita **${apuesta.toLocaleString()}**).` });
      return;
    }

    // 2. Crear Embed y Botones de Reto
    const challengeEmbed = new EmbedBuilder()
      .setColor("Blue")
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
        .setCustomId(`tateti_拒绝_${challenger.id}_${opponent.id}`)
        .setLabel("Rechazar")
        .setStyle(ButtonStyle.Danger),
    );

    const message = await interaction.editReply({
      content: `<@${opponent.id}>`,
      embeds: [challengeEmbed],
      components: [row],
    });

    // Timeout de 10 minutos para el reto inicial
    const timeout = setTimeout(async () => {
      try {
        const expiredEmbed = new EmbedBuilder()
          .setColor("Grey")
          .setTitle("⌛ Desafío Expirado")
          .setDescription("El tiempo para aceptar el desafío de Ta-Te-Ti ha expirado.");
        await message.edit({ embeds: [expiredEmbed], components: [] });
      } catch {}
    }, 10 * 60 * 1000);

    // Guardar referencia temporal si es necesario para coleccionadores globales o manejadores de componentes
  } catch (err: any) {
    logger.error({ err }, "Error al iniciar el reto de tateti");
    await interaction.editReply({ content: `❌ Ocurrió un error al procesar el desafío: \`${err?.message || "Error desconocido"}\`` });
  }
}

// Función auxiliar para verificar si hay línea de 4 en tablero 5x5
function checkWin(board: string[], playerChar: string): boolean {
  // Dimensiones: 5x5
  const size = 5;
  const winLength = 4;

  // 1. Horizontales
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

  // 2. Verticales
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

  // 3. Diagonales (Principal ↘)
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

  // 4. Diagonales (Secundaria ↙)
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

    await interaction.deferUpdate();

    try {
      // Descontar saldo a ambos por la apuesta
      await Promise.all([
        unb.editUserBalance(interaction.guildId!, p1, { cash: -apuesta }),
        unb.editUserBalance(interaction.guildId!, p2, { cash: -apuesta }),
      ]);

      // Inicializar juego 5x5 (25 casillas vacías)
      const game: TatetiGame = {
        p1,
        p2,
        apuesta,
        board: Array(25).fill(""),
        turn: Math.random() < 0.5 ? p1 : p2, // Sorteo inicial aleatorio
      };

      const gameId = `${interaction.channelId}_${Date.now()}`;
      activeGames.set(gameId, game);

      await updateBoardMessage(interaction, game, gameId);
    } catch (err: any) {
      await interaction.followUp({ content: `❌ Error al descontar los fondos para la apuesta: ${err?.message}`, ephemeral: true });
    }
  } else if (customId.startsWith("tateti_move_")) {
    // Formato: tateti_move_gameId_index
    const parts = customId.split("_");
    const gameId = parts[2];
    const index = parseInt(parts[3], 10);

    const game = activeGames.get(gameId);
    if (!game) {
      await interaction.reply({ content: "❌ Esta partida ya ha expirado o finalizado.", ephemeral: true });
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

    // Marcar ficha (P1 es ❌, P2 es ⭕)
    const symbol = interaction.user.id === game.p1 ? "❌" : "⭕";
    game.board[index] = symbol;

    // Verificar victoria
    if (checkWin(game.board, symbol)) {
      const winnerId = interaction.user.id;
      const loserId = winnerId === game.p1 ? game.p2 : game.p1;
      const totalPozo = game.apuesta * 2;

      // Entregar premio completo al ganador
      await unb.editUserBalance(interaction.guildId!, winnerId, { cash: totalPozo });

      const winEmbed = new EmbedBuilder()
        .setColor("Green")
        .setTitle("🎉 ¡Partida Finalizada - Victoria!")
        .setDescription(`¡<@${winnerId}> ha ganado la partida haciendo línea de 4!\n\n💰 Se lleva el pozo de **${totalPozo.toLocaleString()} Frijoles**.`);

      activeGames.delete(gameId);
      await interaction.editReply({ embeds: [winEmbed], components: buildBoardComponents(game, gameId, true) });
      return;
    }

    // Verificar empate (tablero lleno)
    if (game.board.every((cell) => cell !== "")) {
      // Devolver apuestas originales
      await Promise.all([
        unb.editUserBalance(interaction.guildId!, game.p1, { cash: game.apuesta }),
        unb.editUserBalance(interaction.guildId!, game.p2, { cash: game.apuesta }),
      ]);

      const drawEmbed = new EmbedBuilder()
        .setColor("Orange")
        .setTitle("🤝 ¡Empate!")
        .setDescription("El tablero se llenó y nadie logró hacer línea de 4.\n\n💸 Se han devuelto las apuestas intactas a ambos jugadores.");

      activeGames.delete(gameId);
      await interaction.editReply({ embeds: [drawEmbed], components: buildBoardComponents(game, gameId, true) });
      return;
    }

    // Cambiar de turno
    game.turn = game.turn === game.p1 ? game.p2 : game.p1;
    await updateBoardMessage(interaction, game, gameId);
  }
}

// Generador visual del tablero 5x5 con botones
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
    .setColor("Gold")
    .setTitle("⭕ Ta-Te-Ti 5x5 (Línea de 4) ❌")
    .setDescription(`Turno actual: <@${game.turn}> (${game.turn === game.p1 ? "❌" : "⭕"})\n\n• **Jugador 1 (❌):** <@${game.p1}>\n• **Jugador 2 (⭕):** <@${game.p2}>\n• **Pozo en juego:** \`${(game.apuesta * 2).toLocaleString()} Frijoles\``);

  await interaction.editReply({
    embeds: [embed],
    components: buildBoardComponents(game, gameId, false),
  });
}