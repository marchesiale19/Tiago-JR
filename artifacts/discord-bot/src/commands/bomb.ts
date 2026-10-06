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

/* ========================================================================== */
/*                           CONFIGURACIÓN API                                */
/* ========================================================================== */

const UNBELIEVABOAT_API_KEY =
  process.env["UNBELIEVABOAT_API_KEY"];

if (!UNBELIEVABOAT_API_KEY) {
  throw new Error(
    "❌ Falta la variable de entorno UNBELIEVABOAT_API_KEY.",
  );
}

const unb = new UnbClient(
  UNBELIEVABOAT_API_KEY,
);

/* ========================================================================== */
/*                          ROLES AUTORIZADOS                                 */
/* ========================================================================== */

/*
 * Usamos exactamente los mismos roles autorizados
 * que Luckybox Drop.
 */

const BOMB_DROP_AUTHORIZED_ROLES:
  readonly string[] = [
    "1539368076326473868", // Developer Tiago Jr
    "1522807097920720967", // Manager
  ];

/* ========================================================================== */
/*                              TIPOS                                         */
/* ========================================================================== */

type BombType =
  | "comun"
  | "raro"
  | "epico"
  | "admin";

interface BombReward {
  readonly amount: number;
  readonly chance: number;
}

interface BombConfig {
  readonly name: string;
  readonly color: number;
  readonly chance: number;
  readonly rewards: readonly BombReward[];
}

/* ========================================================================== */
/*                       CONFIGURACIÓN DE BOMBAS                              */
/* ========================================================================== */

const BOMB_CONFIG: Record<
  BombType,
  BombConfig
> = {
  comun: {
    name: "Bomba Común",
    color: 0x808080,
    chance: 65,
    rewards: [
      {
        amount: -20_000,
        chance: 70,
      },
      {
        amount: -25_000,
        chance: 30,
      },
    ],
  },

  raro: {
    name: "Bomba Rara",
    color: 0x3498db,
    chance: 25,
    rewards: [
      {
        amount: -150_000,
        chance: 65,
      },
      {
        amount: -250_000,
        chance: 35,
      },
    ],
  },

  epico: {
    name: "Bomba Épica",
    color: 0x9b59b6,
    chance: 9,
    rewards: [
      {
        amount: -600_000,
        chance: 70,
      },
      {
        amount: -1_000_000,
        chance: 30,
      },
    ],
  },

  admin: {
    name: "Bomba Admin",
    color: 0xff0000,
    chance: 1,
    rewards: [
      {
        amount: -1_000_000,
        chance: 70,
      },
      {
        amount: -5_000_000,
        chance: 25,
      },
      {
        amount: -10_000_000,
        chance: 5,
      },
    ],
  },
};

/* ========================================================================== */
/*                          BOTÓN / DROP                                     */
/* ========================================================================== */

const BOMB_DROP_BUTTON_PREFIX =
  "bomb_drop_claim";

/* ========================================================================== */
/*                     DROPS ACTIVOS EN MEMORIA                              */
/* ========================================================================== */

interface ActiveBombDrop {
  readonly dropId: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly bombType: BombType;

  claimed: boolean;
  claimedBy?: string;
}

const activeBombDrops =
  new Map<string, ActiveBombDrop>();

/* ========================================================================== */
/*                              BURLAS                                        */
/* ========================================================================== */

const BOMB_TAUNTS: readonly string[] = [
  "@usuario, sigue tratando de reclamar recompensas sin saber lo que es. Vas a llegar cerca.",
  "@usuario, entraste a un link de dudosa procedencia y te mandó a una pagina árabe.",
  "@usuario se comió la bomba JAKAJJAJAJA.",
  "JAJAJA @usuario, te regalaste",
  "@usuario reclamó sin mirar, qué manera de regalarse",
  "Y bueno @usuario, había que leer",
  "@usuario vio el botón y apagó el cerebro",
  "Te pudo la desesperación, @usuario",
  '@usuario: "drop gratis"',
  "@usuario, hermano... ni miraste?",
  "Qué rápido reclamaste para comerte una bomba, @usuario",
  "Gracias por prestarte voluntariamente a la prueba, @usuario",
  "Bueno, @usuario, disfrutá tu premio",
  "@usuario acaba de aprender que no todo drop tiene premio, aplaudanle",
  "La ansiedad pudo más que el sentido común de @usuario",
  "@usuario reclamó a velocidad récord, la dignidad quedó atrás",
  "@usuario fue demasiado rápido para su propio bien",
  "@usuario no duró ni un segundo antes de mandarse",
  "No podés ser tan desesperado, @usuario",
  "@usuario asi de facil es estafarte?",
  "@usuario leer es gratis sabias?",
  "@usuario, máquina, LEE ANTES DE TOCAR",
  "Te ganó la manija, @usuario",
  '@usuario vio un botón y dijo "es mío", ahi tenes',
  "@usuario eres mas rapido que la velocidad de la luz, pero que pena que no sepas leer",
  "@usuario, ni las instrucciones miraste, hermano",
  "@usuario Te comiste la bomba por apurado, maestro",
  "@usuario estaba esperando un premio y recibió algo mejor",
  "@usuario, no es navidad para que te andes regalando así",
  "@usuario, te faltó leer nomás, máquina",
  "@usuario, quién te apuraba?",
  "@usuario, hermano, era cuestión de LEER",
  "Felicitaciones @usuario, fuiste el primero en descubrir qué había adentro",
  "Excelente velocidad, @usuario. Lástima que era la de hiroshima",
  "Gran tiempo de reacción, @usuario. Cero tiempo de lectura",
  "Felicitaciones @usuario, ganaste mielda",
  "Impresionante velocidad de @usuario. La inteligencia quedó en segundo plano",
  "Bien hecho @usuario ahora que?",
  "@usuario demostró que leer es opcional",
  "@usuario logró exactamente lo que le pedía el instinto: apretar el botón",
  "@usuario, la velocidad fue de profesional. La decisión fue cuestionable",
  "@usuario mañana a la misma hora?",
  '@usuario acaba de descubrir el concepto de "leer antes de hacer"',
  "@usuario ya sabia que ibas a hacer eso",
  "@usuario, hermano, era literalmente leer 2 palabras",
  "Bueno @usuario, qué aprendimos hoy?",
  "@usuario, mañana probamos de vuelta",
  "Excelente decisión @usuario, terrible resultado",
  "@usuario, te faltó una cosita: pensar",
  "@usuario, un botón te papió",
  "@usuario 2 o 3 años en dagestan y aprendes",
  "@usuario vs botón: botón 7 - 0 @usuario",
  "Los superiores ya fueron informados de tu falta de lectura",
  "@usuario, te agradecemos por aportar cagues de risa en el servidor",
  "@usuario, querés saber lo que había en el drop? Yo tampoco",
  "@usuario mira el lado bueno, las risas no faltaron",
  "@usuario, sabes qué pasó? Vos apretaste",
  "@usuario arriba las manos dame todo lo que tienes",
  "@usuario, te iba a explicar qué pasó pero supongo que ya sabes",
  "@usuario, sabes cuál era el prémio? Yo tampoco",
  "@usuario, perdon, me equivoque de persona",
  "@usuario no me la vas a creer, mira tu balance",
  "@usuario, tengo buenas notícias, no son para vos",
  "@usuario no te importaria si agarro un poco de dinero prestado verdad?",
  "@usuario, tu pedido fue rechazado por falta de neuronas",
  "@usuario, tu sentido común está completamente afuera de servicio",
  "@usuario, aceptaste los términos y condiciones de tu cagada",
  "@usuario, la próxima consulta con un adulto responsable antes de tocar",
  "@usuario, skill issue",
  "@usuario, lo duplicas y se lo pasas a la siguiente persona?",
  "@usuario te gustan las sorpresas? Checa tu balance",
];

function getRandomTaunt(
  user: User,
): string {
  const index = Math.floor(
    Math.random() *
      BOMB_TAUNTS.length,
  );

  return (
    BOMB_TAUNTS[index] ??
    "@usuario, qué manera de regalarse."
  ).replaceAll(
    "@usuario",
    `<@${user.id}>`,
  );
}

/* ========================================================================== */
/*                         SORTEAR BOMBA                                      */
/* ========================================================================== */

function pickBombType(): BombType {
  const random =
    Math.random() * 100;

  let accumulated = 0;

  const bombTypes:
    BombType[] = [
      "comun",
      "raro",
      "epico",
      "admin",
    ];

  for (const type of bombTypes) {
    accumulated +=
      BOMB_CONFIG[type].chance;

    if (random < accumulated) {
      return type;
    }
  }

  return "comun";
}

/* ========================================================================== */
/*                       SORTEAR CASTIGO                                      */
/* ========================================================================== */

function pickBombReward(
  bombType: BombType,
): number {
  const rewards =
    BOMB_CONFIG[bombType].rewards;

  const random =
    Math.random() * 100;

  let accumulated = 0;

  for (const reward of rewards) {
    accumulated +=
      reward.chance;

    if (random < accumulated) {
      return reward.amount;
    }
  }

  return (
    rewards[
      rewards.length - 1
    ]?.amount ?? -20_000
  );
}

/* ========================================================================== */
/*                         PERMISOS                                           */
/* ========================================================================== */

function hasBombDropPermission(
  member: {
    roles: {
      cache: {
        has: (
          roleId: string,
        ) => boolean;
      };
    };
  },
): boolean {
  return BOMB_DROP_AUTHORIZED_ROLES.some(
    (roleId) =>
      member.roles.cache.has(
        roleId,
      ),
  );
}

/* ========================================================================== */
/*                         EMBED DROP                                         */
/* ========================================================================== */

function createBombDropEmbed(
  bombType: BombType,
): EmbedBuilder {
  const config =
    BOMB_CONFIG[bombType];

  return new EmbedBuilder()
    .setColor(config.color)
    .setTitle(
      `💣 ¡Se ha soltado una ${config.name}!`,
    )
    .setDescription(
      "¡El primero en presionar **Reclamar** activará la bomba!\n\n" +
      "💀 **Advertencia:** este drop NO tiene premio.",
    )
    .addFields({
      name: "💣 Bomba",
      value:
        `**${config.name}**`,
      inline: true,
    })
    .setFooter({
      text:
        "Sistema de Bomb Drop • Buena suerte... la vas a necesitar.",
    })
    .setTimestamp();
}

/* ========================================================================== */
/*                       BOTÓN DROP                                           */
/* ========================================================================== */

function createBombDropButton(
  dropId: string,
  disabled = false,
): ActionRowBuilder<ButtonBuilder> {
  const button =
    new ButtonBuilder()
      .setCustomId(
        `${BOMB_DROP_BUTTON_PREFIX}:${dropId}`,
      )
      .setLabel("Reclamar")
      .setEmoji("💣")
      .setStyle(
        ButtonStyle.Danger,
      )
      .setDisabled(disabled);

  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(button);
}

/* ========================================================================== */
/*                        EMBED ACTIVADA                                      */
/* ========================================================================== */

function createBombActivatedEmbed(
  bombType: BombType,
  user: User,
  amount: number,
): EmbedBuilder {
  const config =
    BOMB_CONFIG[bombType];

  return new EmbedBuilder()
    .setColor(0xffffff)
    .setTitle(
      "💣 ¡Bomba activada!",
    )
    .setDescription(
      `<@${user.id}> activó la **${config.name}**.`,
    )
    .addFields(
      {
        name: "👤 Usuario",
        value:
          `<@${user.id}>`,
        inline: true,
      },
      {
        name: "💸 Dinero perdido",
        value:
          `**${formatMoney(
            Math.abs(amount),
          )} Frijoles**`,
        inline: true,
      },
      {
        name: "💣 Estado",
        value:
          "`ACTIVADA`",
        inline: false,
      },
    )
    .setFooter({
      text:
        "Sistema de Bomb Drop • Gracias por participar.",
    })
    .setTimestamp();
}

/* ========================================================================== */
/*                           FORMATEAR DINERO                                 */
/* ========================================================================== */

function formatMoney(
  amount: number,
): string {
  return amount.toLocaleString(
    "es-AR",
  );
}

/* ========================================================================== */
/*                           CREAR DROP                                       */
/* ========================================================================== */

async function handleBombDrop(
  sendReply: (
    options: any,
  ) => Promise<any>,
  guild: Guild,
  moderatorUser: User,
  bombType: BombType,
  targetChannel: {
    send: (
      options: any,
    ) => Promise<any>;
  },
): Promise<void> {
  try {
    const member =
      await guild.members
        .fetch(
          moderatorUser.id,
        )
        .catch(() => null);

    if (!member) {
      await sendReply({
        content:
          "❌ No pude verificar tus roles en este servidor.",
        flags:
          MessageFlags.Ephemeral,
      });

      return;
    }

    if (
      !hasBombDropPermission(
        member,
      )
    ) {
      await sendReply({
        content:
          "❌ No tenés un rol autorizado para gestionar los Bomb Drops.",
        flags:
          MessageFlags.Ephemeral,
      });

      return;
    }

    const dropId =
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;

    const embed =
      createBombDropEmbed(
        bombType,
      );

    const row =
      createBombDropButton(
        dropId,
      );

    const dropMessage =
      await targetChannel.send({
        embeds: [embed],
        components: [row],
      });

    activeBombDrops.set(
      dropId,
      {
        dropId,
        guildId: guild.id,
        channelId:
          dropMessage.channelId,
        messageId:
          dropMessage.id,
        bombType,
        claimed: false,
      },
    );

    await sendReply({
      content:
        `💣 La **${BOMB_CONFIG[bombType].name}** fue soltada correctamente en <#${dropMessage.channelId}>.`,
      flags:
        MessageFlags.Ephemeral,
    });

    logger.info(
      {
        guildId: guild.id,
        moderatorUserId:
          moderatorUser.id,
        bombType,
        dropId,
        messageId:
          dropMessage.id,
        channelId:
          dropMessage.channelId,
      },
      "Bomb Drop creado correctamente.",
    );
  } catch (err) {
    logger.error(
      {
        err,
        guildId: guild.id,
        moderatorUserId:
          moderatorUser.id,
        bombType,
      },
      "Error creando Bomb Drop.",
    );

    await sendReply({
      content:
        "❌ No se pudo crear el Bomb Drop.",
      flags:
        MessageFlags.Ephemeral,
    });
  }
}

/* ========================================================================== */
/*                        HANDLE BOTÓN                                        */
/* ========================================================================== */

export async function handleBombDropButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const prefixLength =
    `${BOMB_DROP_BUTTON_PREFIX}:`
      .length;

  const dropId =
    interaction.customId.slice(
      prefixLength,
    );

  if (!dropId) {
    await interaction.reply({
      content:
        "❌ Este botón de bomba no es válido.",
      flags:
        MessageFlags.Ephemeral,
    });

    return;
  }

  if (
    !interaction.guildId ||
    !interaction.guild
  ) {
    await interaction.reply({
      content:
        "❌ Este botón solamente puede utilizarse dentro de un servidor.",
      flags:
        MessageFlags.Ephemeral,
    });

    return;
  }

  const drop =
    activeBombDrops.get(
      dropId,
    );

  if (!drop) {
    await interaction.reply({
      content:
        "❌ Esta bomba ya no está disponible. Es posible que el bot haya sido reiniciado.",
      flags:
        MessageFlags.Ephemeral,
    });

    return;
  }

  if (
    drop.guildId !==
    interaction.guildId
  ) {
    await interaction.reply({
      content:
        "❌ Esta bomba pertenece a otro servidor.",
      flags:
        MessageFlags.Ephemeral,
    });

    return;
  }

  if (drop.claimed) {
    await interaction.reply({
      content:
        "❌ Esta bomba ya fue activada por otro usuario.",
      flags:
        MessageFlags.Ephemeral,
    });

    return;
  }

  /*
   * MUY IMPORTANTE:
   *
   * La marcamos como reclamada ANTES de llamar a la API.
   * Así dos personas que hagan click prácticamente
   * al mismo tiempo no pueden procesar la misma bomba.
   */

  drop.claimed = true;
  drop.claimedBy =
    interaction.user.id;

  await interaction.deferUpdate();

  try {
    /*
     * Sorteamos cuánto dinero pierde.
     */
    const amount =
      pickBombReward(
        drop.bombType,
      );

    /*
     * amount ya es negativo:
     *
     * -20_000
     * -25_000
     * -150_000
     * etc.
     */

    await unb.editUserBalance(
      interaction.guildId,
      interaction.user.id,
      {
        cash: amount,
      },
      `Bomb Drop - ${BOMB_CONFIG[drop.bombType].name}`,
    );

    logger.info(
      {
        guildId:
          interaction.guildId,
        userId:
          interaction.user.id,
        bombType:
          drop.bombType,
        amount,
        dropId:
          drop.dropId,
      },
      "Bomb Drop reclamado correctamente.",
    );

    /*
     * Eliminamos el drop de los activos.
     */
    activeBombDrops.delete(
      drop.dropId,
    );

    /*
     * Actualizamos el embed.
     */
    const activatedEmbed =
      createBombActivatedEmbed(
        drop.bombType,
        interaction.user,
        amount,
      );

    /*
     * Botón deshabilitado.
     */
    const disabledRow =
      createBombDropButton(
        drop.dropId,
        true,
      );

    await interaction.editReply({
      embeds: [
        activatedEmbed,
      ],
      components: [
        disabledRow,
      ],
    });

    /*
     * Mensaje de burla FUERA del embed.
     */
    await interaction.channel?.send(
      getRandomTaunt(
        interaction.user,
      ),
    );

    /*
     * POR AHORA solamente dejamos preparado
     * el sistema base.
     *
     * En el siguiente paso agregaremos:
     *
     * "si me dices papi te devuelvo tu plata"
     *
     * y:
     *
     * "¿querés otra oportunidad?"
     */
  } catch (err) {
    /*
     * Si la API falla, permitimos volver a reclamar.
     */
    drop.claimed = false;
    drop.claimedBy =
      undefined;

    logger.error(
      {
        err,
        guildId:
          interaction.guildId,
        userId:
          interaction.user.id,
        bombType:
          drop.bombType,
        dropId:
          drop.dropId,
      },
      "Falló la aplicación del castigo del Bomb Drop.",
    );

    try {
      await interaction.followUp({
        content:
          "❌ No se pudo procesar la bomba mediante UnbelievaBoat. No se te descontó dinero.",
        flags:
          MessageFlags.Ephemeral,
      });
    } catch (followUpErr) {
      logger.error(
        {
          followUpErr,
        },
        "No se pudo enviar el error del Bomb Drop.",
      );
    }
  }
}

/* ========================================================================== */
/*                         NORMALIZAR BOMBA                                   */
/* ========================================================================== */

function normalizeBombName(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    );
}

function getBombType(
  value: string,
): BombType | null {
  switch (
    normalizeBombName(value)
  ) {
    case "comun":
      return "comun";

    case "raro":
      return "raro";

    case "epico":
      return "epico";

    case "admin":
      return "admin";

    default:
      return null;
  }
}

/* ========================================================================== */
/*                          SLASH COMMAND                                     */
/* ========================================================================== */

export const data =
  new SlashCommandBuilder()
    .setName("bomb")
    .setDescription(
      "Gestioná los Bomb Drops.",
    )
    .addSubcommand(
      (subcommand) =>
        subcommand
          .setName("drop")
          .setDescription(
            "Soltá una bomba para que alguien la reclame.",
          )
          .addStringOption(
            (option) =>
              option
                .setName("bomba")
                .setDescription(
                  "Elegí el tipo de bomba.",
                )
                .setRequired(true)
                .addChoices(
                  {
                    name:
                      "💣 Bomba Común",
                    value:
                      "comun",
                  },
                  {
                    name:
                      "💣 Bomba Rara",
                    value:
                      "raro",
                  },
                  {
                    name:
                      "💣 Bomba Épica",
                    value:
                      "epico",
                  },
                  {
                    name:
                      "💣 Bomba Admin",
                    value:
                      "admin",
                  },
                ),
          )
          .addChannelOption(
            (option) =>
              option
                .setName("canal")
                .setDescription(
                  "Canal donde se soltará la bomba.",
                )
                .addChannelTypes(
                  ChannelType.GuildText,
                )
                .setRequired(false),
          ),
    );

/* ========================================================================== */
/*                           EXECUTE                                          */
/* ========================================================================== */

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (
    !interaction.guildId ||
    !interaction.guild
  ) {
    await interaction.reply({
      content:
        "❌ Este comando solamente se puede usar en servidores.",
      flags:
        MessageFlags.Ephemeral,
    });

    return;
  }

  const subcommand =
    interaction.options.getSubcommand();

  if (
    subcommand !== "drop"
  ) {
    return;
  }

  const bombValue =
    interaction.options.getString(
      "bomba",
      true,
    );

  const bombType =
    getBombType(bombValue);

  if (!bombType) {
    await interaction.reply({
      content:
        "❌ Tipo de bomba inválido.",
      flags:
        MessageFlags.Ephemeral,
    });

    return;
  }

  const selectedChannel =
    interaction.options.getChannel(
      "canal",
    );

  const targetChannel =
    selectedChannel ??
    interaction.channel;

  if (
    !targetChannel ||
    !targetChannel.isTextBased() ||
    !("send" in targetChannel)
  ) {
    await interaction.reply({
      content:
        "❌ No se pudo obtener un canal de texto válido.",
      flags:
        MessageFlags.Ephemeral,
    });

    return;
  }

  await interaction.deferReply({
    flags:
      MessageFlags.Ephemeral,
  });

  await handleBombDrop(
    (options) =>
      interaction.editReply(
        options,
      ),
    interaction.guild,
    interaction.user,
    bombType,
    targetChannel,
  );
}

/* ========================================================================== */
/*                          PREFIX COMMAND                                    */
/* ========================================================================== */

export async function run(
  message: Message,
  args: string[],
): Promise<void> {
  if (
    !message.guildId ||
    !message.guild
  ) {
    await message.reply(
      "❌ Este comando solamente se puede usar en servidores.",
    );

    return;
  }

  const subcommand =
    (
      args[0] ?? ""
    ).toLowerCase();

  if (
    subcommand !== "drop"
  ) {
    await message.reply(
      "❌ Uso correcto: `-bomb drop [bomba] [#canal opcional]`.",
    );

    return;
  }

  const mentionedChannel =
    message.mentions.channels.first();

  const bombArguments =
    args
      .slice(1)
      .filter(
        (arg) =>
          !/^<#\d+>$/.test(
            arg,
          ),
      )
      .join(" ")
      .trim();

  if (!bombArguments) {
    await message.reply(
      "❌ Uso correcto: `-bomb drop [común|raro|épico|admin] [#canal opcional]`.",
    );

    return;
  }

  const bombType =
    getBombType(
      bombArguments,
    );

  if (!bombType) {
    await message.reply(
      "❌ Esa bomba no existe. Las opciones son: `común`, `raro`, `épico` y `admin`.",
    );

    return;
  }

  const targetChannel =
    mentionedChannel ??
    message.channel;

  if (
    !targetChannel ||
    !targetChannel.isTextBased() ||
    !("send" in targetChannel)
  ) {
    await message.reply(
      "❌ No se pudo obtener un canal de texto válido.",
    );

    return;
  }

  await handleBombDrop(
    (options) =>
      message.reply(options),
    message.guild,
    message.author,
    bombType,
    targetChannel,
  );
}
