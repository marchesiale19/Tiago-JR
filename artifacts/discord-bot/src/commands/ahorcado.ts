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
  throw new Error("❌ Falta la variable de entorno UNBELIEVABOAT_API_KEY.");
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
  readonly word: string; // Palabra original en mayúsculas
  readonly normalizedWord: string; // Palabra sin tildes/acentos
  readonly reward: number;
  readonly authorId: string;
  
  guessedLetters: Set<string>;
  wrongLetters: Set<string>;
  livesLeft: number;
  finished: boolean;
}

// Almacén de juegos activos indexados por el ID de mensaje del drop
const activeGames = new Map<string, AhorcadoGame>();

/* ========================================================================== */
/*                             FUNCIONES AUXILIARES                           */
/* ========================================================================== */

function normalizeText(text: string): string {
  return text
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasPermission(member: any): boolean {
  return AHORCADO_AUTHORIZED_ROLES.some((roleId) =>
    member.roles.cache.has(roleId),
  );
}

function getMaskedWord(game: AhorcadoGame): string {
  return game.word
    .split("")
    .map((char, index) => {
      const normChar = game.normalizedWord[index];
      if (char === " ") return "   ";
      if (!/[A-ZÑ]/.test(normChar)) return char;
      return game.guessedLetters.has(normChar) ? char : "\\_";
    })
    .join(" ");
}

function renderGameEmbed(game: AhorcadoGame, statusText?: string): EmbedBuilder {
  const stageIndex = Math.min(6, 6 - game.livesLeft);
  const drawing = STAGES[stageIndex];
  const maskedWord = getMaskedWord(game);
  
  const wrongLettersText = game.wrongLetters.size > 0
    ? Array.from(game.wrongLetters).join(", ")
    : "Ninguna";

  const embed = new EmbedBuilder()
    .setColor(game.finished ? (game.livesLeft > 0 ? 0x57F287 : 0xED4245) : 0xFFA500)
    .setTitle("🔤 ¡EVENTO DE AHORCADO EN VIVO!")
    .setDescription(
      `${statusText ?? "¡Adiviná la palabra letra por letra antes de que se complete el dibujo y quedes colgado!"}\n\n` +
      `${drawing}\n\n` +
      `📌 **Palabra:** \n# \` ${maskedWord} \`\n`
    )
    .addFields(
      {
        name: "💰 Premio acumulado",
        value: `**${game.reward.toLocaleString("es-AR")}** ${MONEDA_EMOJI}`,
        inline: true,
      },
      {
        name: "❤️ Vidas restantes",
        value: `\`${game.livesLeft} / 6\``,
        inline: true,
      },
      {
        name: "❌ Letras erradas",
        value: `\`${wrongLettersText}\``,
        inline: false,
      }
    )
    .setFooter({ text: "Sistema de Ahorcado • Tiagojr Casino" })
    .setTimestamp();

  return embed;
}

function createKeyboardRows(disabled = false): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const layout = [
    ["A", "B", "C", "D", "E", "F"],
    ["G", "H", "I", "J", "K", "L"],
    ["M", "N", "Ñ", "O", "P", "Q"],
    ["R", "S", "T", "U", "V"],
    ["W", "X", "Y", "Z"],
  ];

  for (const rowLetters of layout) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const letter of rowLetters) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ahorcado_guess:${letter}`)
          .setLabel(letter)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled)
      );
    }
    rows.push(row);
  }

  return rows;
}

/* ========================================================================== */
/*                             LÓGICA DEL COMANDO                             */
/* ========================================================================== */

async function startAhorcadoGame(
  guild: Guild,
  author: User,
  targetChannel: GuildTextBasedChannel,
  wordRaw: string,
  reward: number,
  mentionRole?: { id: string },
  sendReply?: (options: any) => Promise<any>
): Promise<void> {
  try {
    const member = await guild.members.fetch(author.id).catch(() => null);
    if (!member || !hasPermission(member)) {
      if (sendReply) {
        await sendReply({
          content: "❌ No tenés ninguno de los roles autorizados para tirar un ahorcado.",
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    const cleanWord = wordRaw.trim().toUpperCase();
    const normalized = normalizeText(cleanWord);

    if (cleanWord.length < 3) {
      if (sendReply) {
        await sendReply({
          content: "❌ La palabra tiene que tener al menos 3 letras, che.",
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    if (reward <= 0) {
      if (sendReply) {
        await sendReply({
          content: "❌ Poné un monto de recompensa válido mayor a 0.",
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    const tempGame: AhorcadoGame = {
      id: "",
      guildId: guild.id,
      channelId: targetChannel.id,
      messageId: "",
      word: cleanWord,
      normalizedWord: normalized,
      reward,
      authorId: author.id,
      guessedLetters: new Set(),
      wrongLetters: new Set(),
      livesLeft: 6,
      finished: false,
    };

    const embed = renderGameEmbed(tempGame);
    const components = createKeyboardRows(false);

    const messageContent = mentionRole ? `<@&${mentionRole.id}>` : undefined;

    const gameMessage = await targetChannel.send({
      content: messageContent,
      embeds: [embed],
      components,
      allowedMentions: mentionRole ? { roles: [mentionRole.id] } : { parse: [] },
    });

    const finalGame: AhorcadoGame = {
      ...tempGame,
      id: gameMessage.id,
      messageId: gameMessage.id,
    };

    activeGames.set(gameMessage.id, finalGame);

    if (sendReply) {
      await sendReply({
        content: `✅ ¡Ahorcado lanzado joya en <#${targetChannel.id}>!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    logger.info(
      { guildId: guild.id, authorId: author.id, word: cleanWord, reward, messageId: gameMessage.id },
      "Juego de Ahorcado iniciado correctamente."
    );
  } catch (err) {
    logger.error({ err, guildId: guild.id }, "Error al iniciar el juego de Ahorcado.");
    if (sendReply) {
      await sendReply({
        content: "❌ Ocurrió un error al intentar mandar el evento de ahorcado.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

/* ========================================================================== */
/*                      MANEJADOR DE BOTONES INTERACTIVOS                     */
/* ========================================================================== */

export async function handleAhorcadoButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;
  if (!customId.startsWith("ahorcado_guess:")) return;

  const letter = customId.split(":")[1];
  const messageId = interaction.message.id;

  const game = activeGames.get(messageId);

  if (!game) {
    await interaction.reply({
      content: "❌ Este juego ya finalizó o el bot se reinició.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (game.finished) {
    await interaction.reply({
      content: "❌ Este ahorcado ya terminó, che.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (game.guessedLetters.has(letter) || game.wrongLetters.has(letter)) {
    await interaction.reply({
      content: `⚠️ La letra **${letter}** ya fue probada. Elegí otra.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();

  const isCorrect = game.normalizedWord.includes(letter);

  if (isCorrect) {
    game.guessedLetters.add(letter);
  } else {
    game.wrongLetters.add(letter);
    game.livesLeft -= 1;
  }

  const wordLetters = game.normalizedWord
    .replace(/ /g, "")
    .split("")
    .filter((char) => /[A-ZÑ]/.test(char));
    
  const hasWon = wordLetters.every((char) => game.guessedLetters.has(char));
  const hasLost = game.livesLeft <= 0;

  if (hasWon) {
    game.finished = true;
    activeGames.delete(messageId);

    try {
      await unb.editUserBalance(
        game.guildId,
        interaction.user.id,
        { cash: game.reward },
        `Ganador de Ahorcado (${game.word})`
      );

      const winEmbed = renderGameEmbed(
        game,
        `🎉 **¡<@${interaction.user.id}> ADIVINÓ LA ÚLTIMA LETRA Y SE LLEVÓ EL PREMIO!**\n\nLa palabra era: **${game.word}**.`
      );

      await interaction.editReply({
        embeds: [winEmbed],
        components: createKeyboardRows(true),
      });

      await interaction.followUp({
        content: `🏆 **¡Felicitaciones <@${interaction.user.id}>!** Le pegaste a la palabra **${game.word}** y te acreditamos **${game.reward.toLocaleString("es-AR")} Frijoles** ${MONEDA_EMOJI} a tu balance.`,
      });

    } catch (rewardErr) {
      logger.error({ rewardErr, userId: interaction.user.id, reward: game.reward }, "Error acreditando recompensa de Ahorcado.");
      await interaction.followUp({
        content: `🎉 ¡Ganaste <@${interaction.user.id}>! Pero hubo un problemita al acreditar los frijoles. Avisale a un staff.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    return;
  }

  if (hasLost) {
    game.finished = true;
    activeGames.delete(messageId);

    const loseEmbed = renderGameEmbed(
      game,
      `💀 **¡SE QUEDARON SIN VIDAS Y QUEDARON TODOS COLGADOS!**\n\nLa palabra oculta era: **${game.word}**.`
    );

    await interaction.editReply({
      embeds: [loseEmbed],
      components: createKeyboardRows(true),
    });

    return;
  }

  const updateStatus = isCorrect
    ? `✨ **¡<@${interaction.user.id}> acertó la letra \`${letter}\`!**`
    : `💥 **¡<@${interaction.user.id}> le erró con la \`${letter}\`!** Perdieron una vida.`;

  const updatedEmbed = renderGameEmbed(game, updateStatus);

  await interaction.editReply({
    embeds: [updatedEmbed],
    components: createKeyboardRows(false),
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
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("palabra")
      .setDescription("La palabra secreta que la gente va a tener que adivinar.")
      .setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName("cantidad")
      .setDescription("Monto en Frijoles que se lleva el ganador.")
      .setRequired(true)
  )
  .addRoleOption((option) =>
    option
      .setName("rol")
      .setDescription("Rol opcional para etiquetar al momento de tirar el drop.")
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "❌ Este comando solo se puede usar en servidores, che.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const targetChannel = interaction.options.getChannel("canal", true) as GuildTextBasedChannel;
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
    (options) => interaction.reply(options)
  );
}

/* ========================================================================== */
/*                       DECLARACIÓN COMANDO PREFIX                           */
/* ========================================================================== */

export async function run(message: Message, args: string[]): Promise<void> {
  if (!message.guildId || !message.guild) {
    await message.reply("❌ Este comando solo funciona dentro del servidor, pa.");
    return;
  }

  if (args.length < 3) {
    await message.reply(
      "❌ **Uso incorrecto.** La sintaxis es:\n`-ahorcado #canal <palabra> <cantidad> [@rol]`\n\n*Ejemplo:* `-ahorcado #casino Messi 100000 @Casino`"
    );
    return;
  }

  const channelMention = message.mentions.channels.first();
  const targetChannel = (channelMention ?? message.channel) as GuildTextBasedChannel;
  const roleMention = message.mentions.roles.first();

  const cleanArgs = args.filter(
    (arg) => !/^<#\d+>$/.test(arg) && !/^<@&\d+>$/.test(arg)
  );

  if (cleanArgs.length < 2) {
    await message.reply("❌ Te faltó poner la palabra o la cantidad del premio.");
    return;
  }

  const word = cleanArgs[0];
  const rewardRaw = cleanArgs[1];
  const reward = parseInt(rewardRaw, 10);

  if (isNaN(reward) || reward <= 0) {
    await message.reply("❌ La cantidad del premio tiene que ser un número entero válido mayor a 0.");
    return;
  }

  await startAhorcadoGame(
    message.guild,
    message.author,
    targetChannel,
    word,
    reward,
    roleMention ? { id: roleMention.id } : undefined,
    (options) => message.reply(options)
  );
}
