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
  type Message,
  type User,
} from "discord.js";

import pkg from "unb-api";
const { Client: UnbClient } = pkg;

import { logger } from "../lib/logger";

const UNBELIEVABOAT_API_KEY = process.env["UNBELIEVABOAT_API_KEY"];
if (!UNBELIEVABOAT_API_KEY) {
  throw new Error("❌ Falta la variable de entorno UNBELIEVABOAT_API_KEY.");
}
const unb = new UnbClient(UNBELIEVABOAT_API_KEY);

const BOMB_DROP_AUTHORIZED_ROLES: readonly string[] = [
  "1539368076326473868", // Developer Tiago Jr
  "1522807097920720967", // Manager
];

const BOMB_DROP_BUTTON_PREFIX = "bomb_drop_claim";
const BOMB_DROP_ORANGE = 0xFFA500;
const BOMB_DROP_WHITE = 0xFFFFFF;

interface ActiveBombDrop {
  readonly dropId: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly bombaNombre: string;
  claimed: boolean;
  claimedBy?: string;
}

const activeBombDrops = new Map();

// Almacenamiento en memoria para el seguimiento de interacciones post-bomba (papi / segunda oportunidad)
interface BombInteractionState {
  userId: string;
  channelId: string;
  lostAmount: number;
  step: "waiting_papi" | "waiting_second_chance" | "done";
  refunded: boolean;
}

const activeBombInteractions = new Map();

const BOMB_MOCK_MESSAGES = [
  "<@usuario>, sigue tratando de reclamar recompensas sin saber lo que es. Vas a llegar cerca.",
  "<@usuario>, entraste a un link de dudosa procedencia y te mandó a una pagina árabe.",
  "<@usuario> se comió la bomba JAKAJJAJAJA.",
  "JAJAJA <@usuario>, te regalaste",
  "<@usuario> reclamó sin mirar, qué manera de regalarse",
  "Y bueno <@usuario>, había que leer",
  "<@usuario> vio el botón y apagó el cerebro",
  "Te pudo la desesperación, <@usuario>",
  "<@usuario>: \"drop gratis\"",
  "<@usuario>, hermano... ni miraste?",
  "Qué rápido reclamaste para comerte una bomba, <@usuario>",
  "Gracias por prestarte voluntariamente a la prueba, <@usuario>",
  "Bueno, <@usuario>, disfrutá tu premio",
  "<@usuario> acaba de aprender que no todo drop tiene premio, aplaudanle",
  "La ansiedad pudo más que el sentido común de <@usuario>",
  "<@usuario> reclamó a velocidad récord, la dignidad quedó atrás",
  "<@usuario> fue demasiado rápido para su propio bien",
  "<@usuario> no duró ni un segundo antes de mandarse",
  "No podés ser tan desesperado, <@usuario>",
  "<@usuario> asi de facil es estafarte?",
  "<@usuario> leer es gratis sabias?",
  "<@usuario>, máquina, LEE ANTES DE TOCAR",
  "Te ganó la manija, <@usuario>",
  "<@usuario> vio un botón y dijo \"es mío\", ahi tenes",
  "<@usuario> eres mas rapido que la velocidad de la luz, pero que pena que no sepas leer",
  "<@usuario>, ni las instrucciones miraste, hermano",
  "<@usuario> Te comiste la bomba por apurado, maestro",
  "<@usuario> estaba esperando un premio y recibió algo mejor",
  "<@usuario>, no es navidad para que te andes regalando así",
  "<@usuario>, te faltó leer nomás, máquina",
  "<@usuario>, quién te apuraba?",
  "<@usuario>, hermano, era cuestión de LEER",
  "Felicitaciones <@usuario>, fuiste el primero en descubrir qué había adentro",
  "@ever y juan MIREN <@usuario> NO SABE LEER!!!!",
  "Excelente velocidad, <@usuario>. Lástima que era la de hiroshima",
  "Gran tiempo de reacción, <@usuario>. Cero tiempo de lectura",
  "Felicitaciones <@usuario>, ganaste mielda",
  "Impresionante velocidad de <@usuario>. La inteligencia quedó en segundo plano",
  "Bien hecho <@usuario> ahora que?",
  "<@usuario> completó el drop exitosamente. La recompensa era un sorete líquido",
  "Récord mundial de reclamar algo sin saber qué era. Felicidades <@usuario>, aplaudanle porfa",
  "<@usuario> demostró que leer es opcional",
  "<@usuario> logró exactamente lo que le pedía el instinto: apretar el botón",
  "<@usuario>, la velocidad fue de profesional. La decisión fue cuestionable y así",
  "<@usuario> mañana a la misma hora?",
  "<@usuario> acaba de descubrir el concepto de \"leer antes de hacer\"",
  "<@usuario> ya sabia que ibas a hacer eso",
  "<@usuario>, @Manager | 𝐑eyly_t𝐳 y @Dev | 𝑨le𝒛inho𝒁 𓆩✞𓆪 ➶ se están cagando de risa ahora mismo",
  "<@usuario> esta bueno que te pase por no saber leer, ahora mira tu cuenta de banco",
  "<@usuario> gracias por la foto de la targeta de tus padres vuelvo en 1 minuto",
  "<@usuario> has escuchado el chiste del bus? Ya se fue, y tu dinero tambien",
  "<@usuario>, máquina, era literalmente leer 2 palabras",
  "Bueno <@usuario>, qué aprendimos hoy?",
  "<@usuario>, mañana probamos de vuelta",
  "Excelente decisión <@usuario>, terrible resultado",
  "<@usuario>, te faltó una cosita: pensar",
  "<@usuario>, un botón te papió",
  "<@usuario> 2 o 3 años en dagestan y aprendes",
  "<@usuario> vs botón: botón 7 - 0 <@usuario>",
  "Que mal <@usuario> veamos si mañana los admins te contestan para que te devuelvan el millon que acabas de perder",
  "<@usuario>, @Manager | 𝐑eyly_t𝐳 vio esto y está decepcionado, digo orgulloso pero de tu compresión lectora",
  "<@usuario>, @Dev | 𝑨le𝒛inho𝒁 𓆩✞𓆪 ➶ sacó clip",
  "<@usuario>, los superiores ya fueron informados de tu falta de lectura",
  "<@usuario> vimos que no estas suscrito al canal de @Owner | Mr Bax asi que te quitamos dinero",
  "<@usuario>, te agradecemos por aportar cagues de risa en el servidor",
  "<@usuario>, querés saber lo que había en el drop? Yo tampoco",
  "<@usuario> mira el lado bueno, las risas no faltaron",
  "<@usuario>, sabes lo que es más rápido que tu dedo? La de nagasaki",
  "<@usuario>, sabes cuál era el prémio? Yo tampoco",
  "<@usuario>, sabes qué pasó? Vos apretaste",
  "<@usuario> arriba las manos dame todo lo que tienes",
  "<@usuario>, sabes lo que tienen en común vos y la bomba? Los 2 aparecen de la nada",
  "<@usuario>, te iba a explicar qué pasó pero supongo que ya sabes",
  "<@usuario>, la buena notícia es que tenes buen tiempo de reacción, la mala es que no ganaste una mielda",
  "<@usuario> veamos si me abres ticket cuando haga esto JAJAJJA",
  "<@usuario> no me la vas a creer, mira tu balance",
  "<@usuario> perdon, me equivoque de persona",
  "<@usuario> te tengo una noticia buena y una mala. La buena es que ganaste el premio, la mala es tu balance.",
  "Es una pena terrible, a <@usuario> le cayo un meteorito mientras caminaba por la calle",
  "<@usuario>, tengo buenas notícias, no son para vos",
  "<@usuario> no te importaria si agarro un poco de dinero prestado verdad?",
  "<@usuario>, tu pedido fue rechazado por falta de neuronas",
  "<@usuario>, tu sentido común está completamente afuera de servicio",
  "<@usuario> necesitas mas de 67 iq para poder reclamar esta recompensa",
  "<@usuario>, el servidor no se hace responsable de tu mielda",
  "<@usuario>, aceptaste los términos y condiciones de tu cagada",
  "@ever y juan, se confirma que <@usuario> sabe apretar botones",
  "<@usuario>, la próxima consulta con un adulto responsable antes de tocar",
  "<@usuario>, skill issue",
  "<@usuario>, lo duplicas y se lo pasas a la siguiente persona?",
  "<@usuario> te gustan las sorpresas? Checa tu balance"
];

function pickBombLoss(bombaNombre: string): { amount: number; text: string } {
  const rand = Math.random() * 100;
  const lower = bombaNombre.toLowerCase();

  if (lower.includes("admin")) {
    if (rand <= 70) return { amount: 1000000, text: "-1,000,000 Frijoles" };
    if (rand <= 90) return { amount: 5000000, text: "-5,000,000 Frijoles" };
    if (rand <= 99) return { amount: 10000000, text: "-10,000,000 Frijoles" };
    return { amount: 100000000, text: "-100,000,000 Frijoles" };
  } else if (lower.includes("épico") || lower.includes("epico")) {
    if (rand <= 80) return { amount: 600000, text: "-600,000 Frijoles" };
    return { amount: 1000000, text: "-1,000,000 Frijoles" };
  } else if (lower.includes("raro")) {
    if (rand <= 80) return { amount: 150000, text: "-150,000 Frijoles" };
    return { amount: 250000, text: "-250,000 Frijoles" };
  } else {
    if (rand <= 80) return { amount: 20000, text: "-20,000 Frijoles" };
    return { amount: 25000, text: "-25,000 Frijoles" };
  }
}

function createBombDropEmbed(bombaNombre: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(BOMB_DROP_ORANGE)
    .setTitle("💣 ¡Bomba soltada!")
    .setDescription(
      `¡Se ha soltado una **${bombaNombre}**!\n\n` +
      `El primero en presionar **Reclamar** se lleva la sorpresa.`
    )
    .addFields({ name: "📦 Bomba", value: `**${bombaNombre}**`, inline: true })
    .setFooter({ text: "Sistema de Bombas • Drop disponible" })
    .setTimestamp();
}

function createBombDropButton(dropId: string, disabled = false): ActionRowBuilder {
  const button = new ButtonBuilder()
    .setCustomId(`\({BOMB_DROP_BUTTON_PREFIX}:\){dropId}`)
    .setLabel("Reclamar")
    .setEmoji("💣")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(disabled);

  return new ActionRowBuilder().addComponents(button);
}

function createBombClaimedEmbed(bombaNombre: string, user: User, lossText: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(BOMB_DROP_WHITE)
    .setTitle("💣 ¡Bomba detonada!")
    .setDescription(`La **\({bombaNombre}** explotó en manos de <@\){user.id}>.`)
    .addFields(
      { name: "📦 Bomba", value: `**${bombaNombre}**`, inline: true },
      { name: "👤 Víctima", value: `<@${user.id}>`, inline: true },
      { name: "💸 Pérdida", value: `**${lossText}**`, inline: false },
      { name: "💥 Estado", value: "`DETONADA`", inline: false }
    )
    .setFooter({ text: "Sistema de Bombas • Drop finalizado" })
    .setTimestamp();
}

export async function handleBombDrop(
  sendReply: any,
  guild: Guild,
  moderatorUser: User,
  bombaNombre: string,
  targetChannel: any,
): Promise {
  try {
    const member = await guild.members.fetch(moderatorUser.id).catch(() => null);
    if (!member || !BOMB_DROP_AUTHORIZED_ROLES.some((r) => member.roles.cache.has(r))) {
      await sendReply({
        content: "❌ No tenés un rol autorizado para gestionar las bombas.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const dropId = `\({Date.now()}-\){Math.random().toString(36).slice(2, 10)}`;
    const embed = createBombDropEmbed(bombaNombre);
    const row = createBombDropButton(dropId);

    const dropMessage = await targetChannel.send({
      embeds: [embed],
      components: [row],
    });

    activeBombDrops.set(dropId, {
      dropId,
      guildId: guild.id,
      channelId: dropMessage.channelId,
      messageId: dropMessage.id,
      bombaNombre,
      claimed: false,
    });

    await sendReply({
      content: `✅ La **\({bombaNombre}** fue soltada correctamente en <#\){dropMessage.channelId}>.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    logger.error({ err }, "Error creando Bomb drop.");
    await sendReply({
      content: "❌ No se pudo crear la Bomba.",
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleBombDropButton(interaction: ButtonInteraction): Promise {
  const dropId = interaction.customId.slice(`${BOMB_DROP_BUTTON_PREFIX}:`.length);
  const drop = activeBombDrops.get(dropId);

  if (!drop || drop.claimed) {
    await interaction.reply({
      content: "❌ Esta bomba ya no está disponible o ya fue reclamada.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  drop.claimed = true;
  drop.claimedBy = interaction.user.id;
  await interaction.deferUpdate();

  try {
    const loss = pickBombLoss(drop.bombaNombre);

    // Restamos el dinero usando UnbelievaBoat
    await unb.editUserBalance(interaction.guildId!, interaction.user.id, {
      cash: -loss.amount,
    });

    activeBombDrops.delete(drop.dropId);

    const claimedEmbed = createBombClaimedEmbed(drop.bombaNombre, interaction.user, loss.text);
    const disabledRow = createBombDropButton(drop.dropId, true);

    await interaction.editReply({
      embeds: [claimedEmbed],
      components: [disabledRow],
    });

    // Mensaje de burla aleatorio fuera del embed en el canal
    const randomMock = BOMB_MOCK_MESSAGES[Math.floor(Math.random() * BOMB_MOCK_MESSAGES.length)];
    const mockText = randomMock.replace(/@usuario/g, `<@${interaction.user.id}>`);
    
    const channel = interaction.channel;
    if (channel && "send" in channel) {
      await channel.send({ content: mockText });
    }

    // Activamos el estado de interacción para "papi" y segunda oportunidad
    activeBombInteractions.set(interaction.user.id, {
      userId: interaction.user.id,
      channelId: interaction.channelId,
      lostAmount: loss.amount,
      step: "waiting_papi",
      refunded: false,
    });

  } catch (err) {
    drop.claimed = false;
    drop.claimedBy = undefined;
    logger.error({ err }, "Falló la detonación de la bomba.");
    await interaction.followUp({
      content: "❌ Hubo un error al procesar la bomba en UnbelievaBoat.",
      flags: MessageFlags.Ephemeral,
    });
  }
}

// Escucha de mensajes en el chat para "papi" y segunda oportunidad
export async function handleBombMessageListener(message: Message): Promise {
  if (message.author.bot || !message.guildId) return;

  const state = activeBombInteractions.get(message.author.id);
  if (!state || state.channelId !== message.channelId) return;

  const content = message.content.trim().toLowerCase();

  if (state.step === "waiting_papi") {
    if (content === "papi" && !state.refunded) {
      state.refunded = true;
      try {
        await unb.editUserBalance(message.guildId, message.author.id, {
          cash: state.lostAmount,
        });
        await message.reply(`🎉 Como dijiste "papi", te devolví tus **${state.lostAmount.toLocaleString()} Frijoles**. ¡No te regales tanto!`);
      } catch (err) {
        logger.error({ err }, "Error al reembolsar saldo por decir papi.");
      }
      
      // Pasamos al paso de segunda oportunidad
      state.step = "waiting_second_chance";
      await message.channel.send(`<@${message.author.id}>, querés otra oportunidad? Responde sí o no`);
      return;
    } else {
      // Si no dijo papi, pasamos directo a la segunda oportunidad
      state.step = "waiting_second_chance";
      await message.channel.send(`<@${message.author.id}>, querés otra oportunidad? Responde sí o no`);
    }
  } else if (state.step === "waiting_second_chance") {
    if (content === "sí" || content === "si") {
      try {
        await unb.editUserBalance(message.guildId, message.author.id, {
          cash: -state.lostAmount,
        });
        await message.reply(`💥 ¡Aceptaste! Se te descontaron **${state.lostAmount.toLocaleString()} Frijoles** adicionales por valiente.`);
      } catch (err) {
        logger.error({ err }, "Error aplicando segunda pérdida.");
      }
    } else if (content === "no") {
      await message.reply("👍 Entendido, te salvaste de otra explosión.");
    }
    activeBombInteractions.delete(message.author.id);
  }
}

/* ========================================================================== */
/*                         SLASH COMMAND /BOMB                                */
/* ========================================================================== */

export const data = new SlashCommandBuilder()
  .setName("bomb")
  .setDescription("Gestioná los drops de bombas trampa.")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("drop")
      .setDescription("Soltá una bomba trampa en el chat.")
      .addStringOption((option) =>
        option
          .setName("bomba")
          .setDescription("Elegí el tipo de bomba que querés soltar.")
          .setRequired(true)
          .addChoices(
            { name: "Bomba Común", value: "Bomba Común" },
            { name: "Bomba Rara", value: "Bomba Rara" },
            { name: "Bomba Épica", value: "Bomba Épica" },
            { name: "Bomba Admin", value: "Bomba Admin" },
          )
      )
      .addChannelOption((option) =>
        option
          .setName("canal")
          .setDescription("Canal opcional para soltar la bomba.")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "❌ Este comando solo se puede usar en servidores.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "drop") {
    const bombaNombre = interaction.options.getString("bomba", true);
    const selectedChannel = interaction.options.getChannel("canal");
    const targetChannel = selectedChannel ?? interaction.channel;

    if (!targetChannel || !targetChannel.isTextBased() || !("send" in targetChannel)) {
      await interaction.reply({
        content: "❌ Canal de texto no válido.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await handleBombDrop(
      (opts: any) => interaction.editReply(opts),
      interaction.guild,
      interaction.user,
      bombaNombre,
      targetChannel
    );
  }
}

// Prefijo de comandos tipo -bomb drop
export async function run(message: Message, args: string[]): Promise {
  if (!message.guildId || !message.guild) {
    await message.reply("❌ Este comando solo se puede usar en servidores.");
    return;
  }

  const mainArg = (args[0] ?? "").toLowerCase();
  if (mainArg === "drop") {
    const mentionedChannel = message.mentions.channels.first();
    const argsClean = args.slice(1).filter((arg) => !/^<#\d+>$/.test(arg)).join(" ").trim();

    const validBombas: Record = {
      comun: "Bomba Común",
      rara: "Bomba Rara",
      epico: "Bomba Épica",
      admin: "Bomba Admin",
    };

    const bombaNombre = validBombas[argsClean.toLowerCase()];
    if (!bombaNombre) {
      await message.reply("❌ Uso correcto: `-bomb drop [común/rara/épico/admin]`");
      return;
    }

    const targetChannel = mentionedChannel ?? message.channel;
    if (!targetChannel || !targetChannel.isTextBased() || !("send" in targetChannel)) {
      await message.reply("❌ Canal no válido.");
      return;
    }

    await handleBombDrop(
      (opts: any) => message.reply(opts),
      message.guild,
      message.author,
      bombaNombre,
      targetChannel
    );
  }
}
