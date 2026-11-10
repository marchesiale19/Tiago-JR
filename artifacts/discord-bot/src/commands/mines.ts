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

// Configuración del tablero 4x4 y 4 bombas
const GRID_SIZE = 4; // 4x4 = 16 casillas
const TOTAL_BOMBS = 4;

// Multiplicadores dinámicos aproximados a medida que se descubren casillas seguras (12 en total)
const MULTIPLIERS = [
  1.20, 1.45, 1.75, 2.10, 2.55, 3.10, 3.80, 4.70, 5.80, 7.20, 9.00, 12.00
];

export const data = new SlashCommandBuilder()
  .setName("mines")
  .setDescription("Juega al Buscaminas de apuestas y retira tus ganancias antes de tocar una bomba.")
  .addIntegerOption((option) =>
    option
      .setName("apuesta")
      .setDescription("Cantidad de frijoles a apostar")
      .setMinValue(1)
      .setRequired(true)
  );

async function startMinesGame(
  guildId: string,
  user: { id: string; toString(): string; displayNaem?: string },
  apuesta: number,
  channel: any,
  isSlash: boolean,
  interaction?: ChatInputCommandInteraction
) {
  if (isSlash && interaction) {
    await interaction.deferReply();
  }

  try {
    const userBalance = await unb.getUserBalance(guildId, user.id);
    const cash = userBalance.cash || 0;

    if (cash < apuesta) {
      const errorMsg = `❌ No tienes suficientes frijoles. Tu saldo actual es de **${cash.toLocaleString()} Frijoles**.`;
      if (isSlash && interaction) {
        await interaction.editReply({ content: errorMsg });
      } else {
        await channel.send({ content: errorMsg });
      }
      return;
    }

    // Descontar la apuesta inicial de inmediato
    await unb.editUserBalance(guildId, user.id, { cash: -apuesta });

    // Generar tablero: 0 = seguro, 1 = bomba
    const board: number[] = Array(GRID_SIZE * GRID_SIZE).fill(0);
    let bombsPlaced = 0;
    while (bombsPlaced < TOTAL_BOMBS) {
      const randomIndex = Math.floor(Math.random() * board.length);
      if (board[randomIndex] === 0) {
        board[randomIndex] = 1;
        bombsPlaced++;
      }
    }

    let revealed: boolean[] = Array(GRID_SIZE * GRID_SIZE).fill(false);
    let safeClicks = 0;
    let gameOver = false;

    // Función para construir la vista de botones 4x4 + controles de cashout
    const buildComponents = (isEnded: boolean = false, revealAll: boolean = false) => {
      const rows: ActionRowBuilder<ButtonBuilder>[] = [];

      for (let r = 0; r < GRID_SIZE; r++) {
        const row = new ActionRowBuilder<ButtonBuilder>();
        for (let c = 0; c < GRID_SIZE; c++) {
          const index = r * GRID_SIZE + c;
          const button = new ButtonBuilder();
          button.setCustomId(`mines_cell_${user.id}_${index}`);

          if (revealAll) {
            if (board[index] === 1) {
              button.setLabel("💣").setStyle(ButtonStyle.Danger).setDisabled(true);
            } else {
              button.setLabel(revealed[index] ? "✨" : "💎").setStyle(ButtonStyle.Secondary).setDisabled(true);
            }
          } else if (isEnded) {
            button.setLabel("▪️").setStyle(ButtonStyle.Secondary).setDisabled(true);
          } else {
            if (revealed[index]) {
              button.setLabel("✨").setStyle(ButtonStyle.Success).setDisabled(true);
            } else {
              button.setLabel("🟦").setStyle(ButtonStyle.Primary);
            }
          }
          row.addComponents(button);
        }
        rows.push(row);
      }

      // Fila de control (Cashout / Rendirse)
      const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`mines_cashout_${user.id}`)
          .setLabel(safeClicks > 0 ? `💰 Retirar (${Math.floor(apuesta * (safeClicks > 0 ? MULTIPLIERS[safeClicks - 1] : 1)).toLocaleString()} Frijoles)` : "💰 Retirar")
          .setStyle(ButtonStyle.Success)
          .setDisabled(isEnded || safeClicks === 0),
        new ButtonBuilder()
          .setCustomId(`mines_surrender_${user.id}`)
          .setLabel("❌ Rendirse")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(isEnded)
      );

      rows.push(controlRow);
      return rows;
    };

    const currentMultiplier = safeClicks > 0 ? MULTIPLIERS[safeClicks - 1] : 1.0;
    const currentPotential = Math.floor(apuesta * currentMultiplier);

    const embed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle("💣 Buscaminas (Mines)")
      .setDescription(
        `Jugador: ${user.toString()}\n` +
        `💰 **Apuesta:** \`${apuesta.toLocaleString()} Frijoles\`\n` +
        `📊 **Multiplicador actual:** \`x${currentMultiplier.toFixed(2)}\`\n` +
        `💎 **Premio potencial:** \`${currentPotential.toLocaleString()} Frijoles\`\n\n` +
        `*Haz clic en una casilla segura para sumar multiplicador o retírate cuando quieras.*`
      );

    const payload = { embeds: [embed], components: buildComponents() };
    const sentMessage = isSlash && interaction ? await interaction.editReply(payload) : await channel.send(payload);

    const collector = sentMessage.createMessageComponentCollector({
      time: 5 * 60 * 1000, // 5 minutos de tiempo límite
    });

    collector.on("collect", async (i: ButtonInteraction) => {
      if (i.user.id !== user.id) {
        await i.reply({ content: "❌ Este juego no es tuyo.", ephemeral: true });
        return;
      }

      const parts = i.customId.split("_");
      const action = parts[1];

      if (action === "surrender") {
        gameOver = true;
        collector.stop("surrendered");
        await i.update({
          content: `❌ Te rendiste. Perdiste tu apuesta de **${apuesta.toLocaleString()} Frijoles**.`,
          embeds: [
            EmbedBuilder.from(embed)
              .setColor("Red")
              .setTitle("💣 Buscaminas - Partida Abandonada")
          ],
          components: buildComponents(true, true),
        });
        return;
      }

      if (action === "cashout") {
        gameOver = true;
        collector.stop("cashout");

        const winnings = Math.floor(apuesta * MULTIPLIERS[safeClicks - 1]);
        await unb.editUserBalance(guildId, user.id, { cash: winnings });

        await i.update({
          content: `🎉 ¡Retiro exitoso! Ganaste un total de **${winnings.toLocaleString()} Frijoles** (Beneficio: +${(winnings - apuesta).toLocaleString()}).`,
          embeds: [
            EmbedBuilder.from(embed)
              .setColor("Green")
              .setTitle("💰 Buscaminas - Retiro Exitoso")
              .setDescription(`Jugador: ${user.toString()}\n💰 **Apuesta:** \`${apuesta.toLocaleString()}\`\n🏆 **Ganancia neta:** \`+${(winnings - apuesta).toLocaleString()} Frijoles\``)
          ],
          components: buildComponents(true, true),
        });
        return;
      }

      if (action === "cell") {
        const cellIndex = parseInt(parts[3], 10);

        if (revealed[cellIndex] || gameOver) {
          await i.reply({ content: "❌ Esta casilla ya fue abierta o la partida terminó.", ephemeral: true });
          return;
        }

        // Si pisa una bomba
        if (board[cellIndex] === 1) {
          gameOver = true;
          collector.stop("boom");

          await i.update({
            content: `💥 ¡BOOM! Pisaste una mina y perdiste tus **${apuesta.toLocaleString()} Frijoles**.`,
            embeds: [
              EmbedBuilder.from(embed)
                .setColor("Red")
                .setTitle("💥 Buscaminas - ¡Game Over!")
            ],
            components: buildComponents(true, true),
          });
          return;
        }

        // Si es casilla segura
        revealed[cellIndex] = true;
        safeClicks++;

        // Si despejó todas las 12 casillas seguras posibles sin tocar bombas
        if (safeClicks === GRID_SIZE * GRID_SIZE - TOTAL_BOMBS) {
          gameOver = true;
          collector.stop("won_all");

          const maxWinnings = Math.floor(apuesta * MULTIPLIERS[MULTIPLIERS.length - 1]);
          await unb.editUserBalance(guildId, user.id, { cash: maxWinnings });

          await i.update({
            content: `👑 ¡IMPRESIONANTE! ¡Despejaste todo el tablero sin detonar ninguna bomba! Ganaste **${maxWinnings.toLocaleString()} Frijoles**.`,
            embeds: [
              EmbedBuilder.from(embed)
                .setColor("Gold")
                .setTitle("👑 Buscaminas - ¡Tablero Completado!")
            ],
            components: buildComponents(true, true),
          });
          return;
        }

        const newMultiplier = MULTIPLIERS[safeClicks - 1];
        const newPotential = Math.floor(apuesta * newMultiplier);

        const updatedEmbed = EmbedBuilder.from(embed)
          .setDescription(
            `Jugador: ${user.toString()}\n` +
            `💰 **Apuesta:** \`${apuesta.toLocaleString()} Frijoles\`\n` +
            `📊 **Multiplicador actual:** \`x${newMultiplier.toFixed(2)}\`\n` +
            `💎 **Premio potencial:** \`${newPotential.toLocaleString()} Frijoles\`\n\n` +
            `*¡Casilla segura encontrada! Sigue eligiendo o presiona Retirar.*`
          );

        await i.update({
          embeds: [updatedEmbed],
          components: buildComponents(false, false),
        });
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason === "time" && !gameOver) {
        try {
          await sentMessage.edit({
            content: `⏱️ La partida de Buscaminas expiró por inactividad. Se retuvo tu apuesta.`,
            components: buildComponents(true, true),
          });
        } catch (err) {
          logger.error({ err }, "Error al expirar mensaje de mines");
        }
      }
    });

  } catch (err: any) {
    logger.error({ err }, "Error al iniciar minijuego de mines");
    const errMsg = `❌ Ocurrió un error al procesar el juego: ${err?.message}`;
    if (isSlash && interaction) {
      await interaction.editReply({ content: errMsg });
    } else {
      await channel.send({ content: errMsg });
    }
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) return;
  const user = interaction.user;
  const apuesta = interaction.options.getInteger("apuesta", true);

  await startMinesGame(interaction.guildId, user, apuesta, interaction.channel, true, interaction);
}

export async function run(message: Message, args: string[]): Promise<void> {
  if (!message.guildId) return;
  const apuesta = parseInt(args[0], 10);

  if (isNaN(apuesta) || apuesta <= 0) {
    await message.reply("❌ Uso correcto: `-mines <apuesta>`");
    return;
  }

  await startMinesGame(message.guildId, message.author, apuesta, message.channel, false);
}

export async function handleButton(_interaction: ButtonInteraction): Promise<void> {}
