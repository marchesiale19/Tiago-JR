
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildTextBasedChannel,
  type Message,
  type User,
} from "discord.js";

import pkg from "unb-api";
const { Client: UnbClient } = pkg;

import { logger } from "../lib/logger";

/* ========================================================================== */
/*                           CONFIGURACIÓN API                                */
/* ========================================================================== */

const UNBELIEVABOAT_API_KEY = process.env["UNBELIEVABOAT_API_KEY"];

if (!UNBELIEVABOAT_API_KEY) {
  throw new Error("Falta la variable de entorno UNBELIEVABOAT_API_KEY.");
}

const unb = new UnbClient(UNBELIEVABOAT_API_KEY);

/* ========================================================================== */
/*                         ROLES AUTORIZADOS                                  */
/* ========================================================================== */

const AHORCADO_AUTHORIZED_ROLES: readonly string[] = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1569589134962462790", // Administrador Elite
  "1522434536796061816", // Desarrollador
  "1453211902267228160", // Administrador
  "1509760475653472287", // Administrador [PB]
  "1522807097920720967", // Manager
];

const MONEDA_EMOJI = "<:MonedaServer:1524674026188967956>";

const MAX_LIVES = 6;

/* ========================================================================== */
/*                         ALFABETO Y TECLADO                                 */
/* ========================================================================== */

// Alfabeto español completo: 27 letras.
const ALPHABET = Array.from("ABCDEFGHIJKLMNÑOPQRSTUVWXYZ");

// Discord permite 5 filas de 5 botones.
// Página 1: primeras 20 letras.
// Página 2: últimas 7 letras.

const LETTERS_PER_PAGE = 20;
const KEYBOARD_MAX_ROWS = 5;
const BUTTONS_PER_ROW = 5;

/* ========================================================================== */
/*                         DIBUJOS DEL AHORCADO                               */
/* ========================================================================== */

const STAGES = [
  `\`\`\`
  +---+
  |   |
      |
      |
      |
      |
=========
\`\`\``,

  `\`\`\`
  +---+
  |   |
  O   |
      |
      |
      |
=========
\`\`\``,

  `\`\`\`
  +---+
  |   |
  O   |
  |   |
      |
      |
=========
\`\`\``,

  `\`\`\`
  +---+
  |   |
  O   |
 /|   |
      |
      |
=========
\`\`\``,

  `\`\`\`
  +---+
  |   |
  O   |
 /|\\  |
      |
      |
=========
\`\`\``,

  `\`\`\`
  +---+
  |   |
  O   |
 /|\\  |
 /    |
      |
=========
\`\`\``,

  `\`\`\`
  +---+
  |   |
  O   |
 /|\\  |
 / \\  |
      |
=========
\`\`\``,
];

/* ========================================================================== */
/*                            ESTADO DEL JUEGO                                */
/* ========================================================================== */

interface AhorcadoGame {
  readonly id: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly word: string;
  readonly normalizedWord: string;
  readonly reward: number;
  readonly authorId: string;

  guessedLetters: Set<string>;
  wrongLetters: Set<string>;
  livesLeft: number;
  finished: boolean;
}

// Juegos activos, identificados por el ID del mensaje.
const activeGames = new Map<string, AhorcadoGame>();

// Página actual del teclado de cada juego.
const keyboardPages = new Map<string, number>();

/* ========================================================================== */
/*                             FUNCIONES AUXILIARES                           */
/* ========================================================================== */

function normalizeText(text: string): string {
  return text
    .trim()
    .toUpperCase()
    .normalize("NFD")
    // Conservamos la Ñ como letra independiente.
    .replace(/N\u0303/g, "Ñ")
    // Eliminamos los demás acentos.
    .replace(/[\u0300-\u036f]/g, "");
}

function hasPermission(member: {
  roles: { cache: { has(roleId: string): boolean } };
}): boolean {
  return AHORCADO_AUTHORIZED_ROLES.some((roleId) =>
    member.roles.cache.has(roleId),
  );
}

function getMaskedWord(game: AhorcadoGame): string {
  const originalLetters = Array.from(game.word);
  const normalizedLetters = Array.from(game.normalizedWord);

  return originalLetters
    .map((char, index) => {
      const normalizedChar = normalizedLetters[index];

      if (char === " ") return "   ";

      if (!normalizedChar || !/^[A-ZÑ]$/.test(normalizedChar)) {
        return char;
      }

      return game.guessedLetters.has(normalizedChar) ? char : "\\_";
    })
    .join(" ");
}

function renderGameEmbed(
  game: AhorcadoGame,
  statusText?: string,
): EmbedBuilder {
  const stageIndex = Math.min(
    STAGES.length - 1,
    MAX_LIVES - game.livesLeft,
  );

  const drawing = STAGES[stageIndex];

  const maskedWord = getMaskedWord(game);

  const wrongLettersText =
    game.wrongLetters.size > 0
      ? Array.from(game.wrongLetters).join(", ")
      : "Ninguna";

  return new EmbedBuilder()
    .setColor(
      game.finished
        ? game.livesLeft > 0
          ? 0x57f287
          : 0xed4245
        : 0xffa500,
    )
    .setTitle("🔤 ¡EVENTO DE AHORCADO EN VIVO!")
    .setDescription(
      `${statusText ?? "¡Adiviná la palabra letra por letra antes de que se complete el dibujo!"}\n\n` +
        `${drawing}\n\n` +
        `📌 **Palabra:**\n# \` ${maskedWord} \`\n`,
    )
    .addFields(
      {
        name: "💰 Premio acumulado",
        value: `**${game.reward.toLocaleString("es-AR")}** ${MONEDA_EMOJI}`,
        inline: true,
      },
      {
        name: "❤️ Vidas restantes",
        value: `\`${game.livesLeft} / ${MAX_LIVES}\``,
        inline: true,
      },
      {
        name: "❌ Letras erradas",
        value: `\`${wrongLettersText}\``,
        inline: false,
      },
    )
    .setFooter({
      text: "Sistema de Ahorcado • Tiagojr Casino",
    })
    .setTimestamp();
}

/* ========================================================================== */
/*                         TECLADO INTERACTIVO                                */
/* ========================================================================== */

function createKeyboardRows(
  disabled = false,
  page = 0,
): ActionRowBuilder<ButtonBuilder>[] {
  const safePage = page === 1 ? 1 : 0;

  const startIndex = safePage * LETTERS_PER_PAGE;

  const pageLetters = ALPHABET.slice(
    startIndex,
    startIndex + LETTERS_PER_PAGE,
  );

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  // Distribución automática en filas de máximo 5 botones.
  for (
    let i = 0;
    i < pageLetters.length;
    i += BUTTONS_PER_ROW
  ) {
    const row = new ActionRowBuilder<ButtonBuilder>();

    const letters = pageLetters.slice(
      i,
      i + BUTTONS_PER_ROW,
    );

    for (const letter of letters) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ahorcado_guess:${letter}`)
          .setLabel(letter)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
      );
    }

    rows.push(row);
  }

  // Navegación entre páginas.
  // La navegación ocupa una fila propia.

  const navigationRow = new ActionRowBuilder<ButtonBuilder>();

  navigationRow.addComponents(
    new ButtonBuilder()
      .setCustomId(
        `ahorcado_page:${safePage === 0 ? 1 : 0}`,
      )
      .setLabel(
        safePage === 0
          ? "Más letras →"
          : "← Volver",
      )
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
  );

  rows.push(navigationRow);

  // Protección adicional de los límites de Discord.
  if (rows.length > KEYBOARD_MAX_ROWS) {
    throw new Error(
      `El teclado del Ahorcado supera el límite de ${KEYBOARD_MAX_ROWS} filas.`,
    );
  }

  return rows;
}

/* ========================================================================== */
/*                           INICIO DEL JUEGO                                 */
/* ========================================================================== */

async function startAhorcadoGame(
  guild: Guild,
  author: User,
  targetChannel: GuildTextBasedChannel,
  wordRaw: string,
  reward: number,
  mentionRole?: { id: string },
  sendReply?: (options: any) => Promise<any>,
): Promise<void> {
  try {
    // Verificación de permisos.
    const member = await guild.members
      .fetch(author.id)
      .catch(() => null);

    if (!member || !hasPermission(member)) {
      if (sendReply) {
        await sendReply({
          content:
            "❌ No tenés ninguno de los roles autorizados para lanzar un Ahorcado.",
          flags: MessageFlags.Ephemeral,
        });
      }

      return;
    }

    // Validación de palabra.
    const cleanWord = wordRaw.trim().toUpperCase();
    const normalized = normalizeText(cleanWord);

    const letterCount = Array.from(normalized).filter(
      (char) => /^[A-ZÑ]$/.test(char),
    ).length;

    if (letterCount < 3) {
      if (sendReply) {
        await sendReply({
          content:
            "❌ La palabra tiene que tener al menos 3 letras.",
          flags: MessageFlags.Ephemeral,
        });
      }

      return;
    }

    // Validación del premio.
    if (!Number.isSafeInteger(reward) || reward <= 0) {
      if (sendReply) {
        await sendReply({
          content:
            "❌ El premio debe ser un número entero válido mayor a 0.",
          flags: MessageFlags.Ephemeral,
        });
      }

      return;
    }

    // Estado inicial.
    const tempGame: AhorcadoGame = {
      id: "",
      guildId: guild.id,
      channelId: targetChannel.id,
      messageId: "",
      word: cleanWord,
      normalizedWord: normalized,
      reward,
      authorId: author.id,

      guessedLetters: new Set<string>(),
      wrongLetters: new Set<string>(),

      livesLeft: MAX_LIVES,
      finished: false,
    };

    const embed = renderGameEmbed(tempGame);

    const components = createKeyboardRows(false, 0);

    const messageContent = mentionRole
      ? `<@&${mentionRole.id}>`
      : undefined;

    // Publicar el evento.
    const gameMessage = await targetChannel.send({
      content: messageContent,
      embeds: [embed],
      components,
      allowedMentions: mentionRole
        ? { roles: [mentionRole.id] }
        : { parse: [] },
    });

    // Registrar el juego.
    const finalGame: AhorcadoGame = {
      ...tempGame,
      id: gameMessage.id,
      messageId: gameMessage.id,
    };

    activeGames.set(gameMessage.id, finalGame);
    keyboardPages.set(gameMessage.id, 0);

    if (sendReply) {
      await sendReply({
        content:
          `✅ ¡Ahorcado lanzado correctamente en <#${targetChannel.id}>!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    logger.info(
      {
        guildId: guild.id,
        authorId: author.id,
        word: cleanWord,
        reward,
        messageId: gameMessage.id,
      },
      "Juego de Ahorcado iniciado correctamente.",
    );
  } catch (err) {
    logger.error(
      {
        err,
        guildId: guild.id,
        authorId: author.id,
        channelId: targetChannel.id,
      },
      "Error al iniciar el juego de Ahorcado.",
    );

    if (sendReply) {
      await sendReply({
        content:
          "❌ Ocurrió un error al intentar mandar el evento de Ahorcado. Revisá los logs del bot.",
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }
  }
}

/* ========================================================================== */
/*                      MANEJADOR DE BOTONES INTERACTIVOS                     */
/* ========================================================================== */

export async function handleAhorcadoButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const customId = interaction.customId;

  const isGuess = customId.startsWith("ahorcado_guess:");
  const isPage = customId.startsWith("ahorcado_page:");

  if (!isGuess && !isPage) return;

  const messageId = interaction.message.id;

  const game = activeGames.get(messageId);

  // Comprobar que el juego siga activo.
  if (!game) {
    await interaction.reply({
      content:
        "❌ Este juego ya finalizó o el bot se reinició.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  if (game.finished) {
    await interaction.reply({
      content: "❌ Este Ahorcado ya terminó.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  /* ------------------------------------------------------------------------ */
  /*                         CAMBIO DE PÁGINA                                 */
  /* ------------------------------------------------------------------------ */

  if (isPage) {
    const requestedPage = customId.split(":")[1];

    const newPage = requestedPage === "1" ? 1 : 0;

    keyboardPages.set(messageId, newPage);

    await interaction.deferUpdate();

    await interaction.editReply({
      components: createKeyboardRows(false, newPage),
    });

    return;
  }

  /* ------------------------------------------------------------------------ */
  /*                         ADIVINAR LETRA                                   */
  /* ------------------------------------------------------------------------ */

  const letter = customId.split(":")[1];

  if (!letter || !ALPHABET.includes(letter)) {
    await interaction.reply({
      content: "❌ Esta letra no es válida.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  if (
    game.guessedLetters.has(letter) ||
    game.wrongLetters.has(letter)
  ) {
    await interaction.reply({
      content:
        `⚠️ La letra **${letter}** ya fue probada. Elegí otra.`,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const currentPage = keyboardPages.get(messageId) ?? 0;

  await interaction.deferUpdate();

  const isCorrect = game.normalizedWord.includes(letter);

  if (isCorrect) {
    game.guessedLetters.add(letter);
  } else {
    game.wrongLetters.add(letter);
    game.livesLeft -= 1;
  }

  // Comprobar victoria.
  const wordLetters = Array.from(game.normalizedWord).filter(
    (char) => /^[A-ZÑ]$/.test(char),
  );

  const hasWon = wordLetters.every((char) =>
    game.guessedLetters.has(char),
  );

  const hasLost = game.livesLeft <= 0;

  /* ------------------------------------------------------------------------ */
  /*                              VICTORIA                                    */
  /* ------------------------------------------------------------------------ */

  if (hasWon) {
    game.finished = true;

    activeGames.delete(messageId);
    keyboardPages.delete(messageId);

    try {
      await unb.editUserBalance(
        game.guildId,
        interaction.user.id,
        { cash: game.reward },
        `Ganador de Ahorcado (${game.word})`,
      );

      const winEmbed = renderGameEmbed(
        game,
        `🎉 **¡<@${interaction.user.id}> ADIVINÓ LA PALABRA Y SE LLEVÓ EL PREMIO!**\n\nLa palabra era: **${game.word}**.`,
      );

      await interaction.editReply({
        embeds: [winEmbed],
        components: createKeyboardRows(true, currentPage),
      });

      await interaction.followUp({
        content:
          `🏆 **¡Felicitaciones <@${interaction.user.id}>!** ` +
          `Adivinaste la palabra **${game.word}** y recibiste ` +
          `**${game.reward.toLocaleString("es-AR")} Frijoles** ${MONEDA_EMOJI}.`,
      });
    } catch (rewardErr) {
      logger.error(
        {
          rewardErr,
          userId: interaction.user.id,
          guildId: game.guildId,
          reward: game.reward,
        },
        "Error acreditando recompensa de Ahorcado.",
      );

      await interaction.editReply({
        embeds: [
          renderGameEmbed(
            game,
            `🎉 **¡<@${interaction.user.id}> ADIVINÓ LA PALABRA!**\n\nLa palabra era: **${game.word}**.\n\n⚠️ Hubo un problema al acreditar el premio. Avisale a un administrador.`,
          ),
        ],
        components: createKeyboardRows(true, currentPage),
      }).catch(() => null);

      await interaction.followUp({
        content:
          "⚠️ Ganaste el Ahorcado, pero hubo un problema al acreditar los Frijoles. Avisale al staff.",
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }

    return;
  }

  /* ------------------------------------------------------------------------ */
  /*                              DERROTA                                     */
  /* ------------------------------------------------------------------------ */

  if (hasLost) {
    game.finished = true;

    activeGames.delete(messageId);
    keyboardPages.delete(messageId);

    const loseEmbed = renderGameEmbed(
      game,
      `💀 **¡SE QUEDARON SIN VIDAS!**\n\nLa palabra oculta era: **${game.word}**.`,
    );

    await interaction.editReply({
      embeds: [loseEmbed],
      components: createKeyboardRows(true, currentPage),
    });

    return;
  }

  /* ------------------------------------------------------------------------ */
  /*                         ACTUALIZACIÓN NORMAL                             */
  /* ------------------------------------------------------------------------ */

  const updateStatus = isCorrect
    ? `✨ **¡<@${interaction.user.id}> acertó la letra \`${letter}\`!**`
    : `💥 **¡<@${interaction.user.id}> le erró con la \`${letter}\`!** Perdieron una vida.`;

  const updatedEmbed = renderGameEmbed(game, updateStatus);

  await interaction.editReply({
    embeds: [updatedEmbed],
    components: createKeyboardRows(false, currentPage),
  });
}

/* ========================================================================== */
/*                        DECLARACIÓN SLASH COMMAND                           */
/* ========================================================================== */

export const data = new SlashCommandBuilder()
  .setName("ahorcado")
  .setDescription("Lanzá un evento de Ahorcado interactivo en un canal.")
  .addChannelOption((option) =>
    option
      .setName("canal")
      .setDescription("Canal donde se va a mandar el evento.")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("palabra")
      .setDescription("La palabra secreta que tendrán que adivinar.")
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("cantidad")
      .setDescription("Monto en Frijoles que se lleva el ganador.")
      .setMinValue(1)
      .setRequired(true),
  )
  .addRoleOption((option) =>
    option
      .setName("rol")
      .setDescription("Rol opcional para etiquetar al lanzar el evento.")
      .setRequired(false),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "❌ Este comando solo funciona dentro de un servidor.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const targetChannel = interaction.options.getChannel(
    "canal",
    true,
  ) as GuildTextBasedChannel;

  const word = interaction.options.getString("palabra", true);

  const reward = interaction.options.getInteger("cantidad", true);

  const role = interaction.options.getRole("rol");

  await startAhorcadoGame(
    interaction.guild,
    interaction.user,
    targetChannel,
    word,
    reward,
    role ? { id: role.id } : undefined,
    (options) => interaction.reply(options),
  );
}

/* ========================================================================== */
/*                       DECLARACIÓN COMANDO PREFIX                           */
/* ========================================================================== */

export async function run(
  message: Message,
  args: string[],
): Promise<void> {
  if (!message.guildId || !message.guild) {
    await message.reply(
      "❌ Este comando solo funciona dentro del servidor.",
    );

    return;
  }

  if (args.length < 3) {
    await message.reply(
      "❌ **Uso incorrecto.** La sintaxis es:\n" +
        "`-ahorcado #canal <palabra> <cantidad> [@rol]`\n\n" +
        "*Ejemplo:* `-ahorcado #casino Messi 100000 @Casino`",
    );

    return;
  }

  const channelMention = message.mentions.channels.first();

  const targetChannel = (
    channelMention ?? message.channel
  ) as GuildTextBasedChannel;

  const roleMention = message.mentions.roles.first();

  // Eliminamos las menciones del contenido de los argumentos.
  const cleanArgs = args.filter(
    (arg) =>
      !/^<#\d+>$/.test(arg) &&
      !/^<@&\d+>$/.test(arg),
  );

  if (cleanArgs.length < 2) {
    await message.reply(
      "❌ Te faltó poner la palabra o la cantidad del premio.",
    );

    return;
  }

  const word = cleanArgs[0];

  const rewardRaw = cleanArgs[1];

  const reward = Number(rewardRaw);

  if (!Number.isSafeInteger(reward) || reward <= 0) {
    await message.reply(
      "❌ La cantidad del premio tiene que ser un número entero válido mayor a 0.",
    );

    return;
  }

  await startAhorcadoGame(
    message.guild,
    message.author,
    targetChannel,
    word,
    reward,
    roleMention ? { id: roleMention.id } : undefined,
    (options) => message.reply(options),
  );
}
