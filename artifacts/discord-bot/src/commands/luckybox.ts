import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
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
  process.env.UNBELIEVABOAT_API_KEY;

if (!UNBELIEVABOAT_API_KEY) {
  throw new Error(
    "❌ Falta la variable de entorno UNBELIEVABOAT_API_KEY.",
  );
}

const unb = new UnbClient(
  UNBELIEVABOAT_API_KEY,
);

/* ========================================================================== */
/*                                  TIPOS                                     */
/* ========================================================================== */

type RewardType =
  | "positivo"
  | "negativo"
  | "rol_seguro"
  | "rol_quebrado"
  | "rol_esclavo_sady"
  | "rol_esclavo_rayii"
  | "rol_esclavo_bax"
  | "rol_esclavo_santiago"
  | "rol_esclavo_rayi"
  | "rol_omg_bro";

interface LuckyboxReward {
  readonly texto: string;
  readonly valor: number;
  readonly tipo: RewardType;
  readonly probabilidad: string;
}

interface InventoryItem {
  item_id?: string;
  itemId?: string;
  id?: string;
  name?: string;
  item_name?: string;
  quantity?: number | string;
  quantiy?: number | string;
  count?: number | string;
}

interface SyncTopCasinoResult {
  success: boolean;
  added: number;
  removed: number;
  error?: string;
}

type ReplyFunction = (
  options: any,
) => Promise<any>;

/* ========================================================================== */
/*                                  ROLES                                     */
/* ========================================================================== */

export const ROL_TOP_CASINO_ID =
  "1546068235072442398";

export const ROL_SEGURO_ID =
  "1461499864457412865";

export const ROL_QUEBRADO_ID =
  "1478210697199353976";

export const ROL_ESCLAVO_SADY_ID =
  "1478210995066372337";

export const ROL_ESCLAVO_RAYII_ID =
  "1478210926883639456";

export const ROL_ESCLAVO_BAX_ID =
  "1461517408203313244";

export const ROL_ESCLAVO_SANTIAGO_ID =
  "1461961845513519187";

export const ROL_ESCLAVO_RAYI_ID =
  "1478210926883639456";

export const ROL_OMG_BRO_ID =
  "1478217120465555630";

/* ========================================================================== */
/*                           IDS DE LUCKYBOX                                  */
/* ========================================================================== */

const LUCKYBOX_IDS: Record<
  string,
  string
> = {
  "mr lucky común":
    "1545211721772305804",

  "mr lucky comun":
    "1545211721772305804",

  "mr lucky raro":
    "1548866970819101248",

  "mr lucky épico":
    "1461518959055602890",

  "mr lucky epico":
    "1461518959055602890",

  "mr lucky admin":
    "1461563297299040148",
};

/* ========================================================================== */
/*                          ROLES AUTORIZADOS                                 */
/* ========================================================================== */

export const AUTHORIZED_ROLES: readonly string[] =
  [
    "1451383215603585140",
    "1508266687689003039",
    "1512634750152478851",
    "1485101671875874997",
    "1455419124732657801",
    "1522434536796061816",
    "1453211902267228160",
    "1509760475653472287",
    "1522807097920720967",
    "1539368076326473868",
  ];

/* ========================================================================== */
/*                             MAPA DE ROLES                                  */
/* ========================================================================== */

const ROLE_MAP: Record<
  string,
  string
> = {
  rol_seguro: ROL_SEGURO_ID,
  rol_quebrado: ROL_QUEBRADO_ID,
  rol_esclavo_sady:
    ROL_ESCLAVO_SADY_ID,
  rol_esclavo_rayii:
    ROL_ESCLAVO_RAYII_ID,
  rol_esclavo_bax:
    ROL_ESCLAVO_BAX_ID,
  rol_esclavo_santiago:
    ROL_ESCLAVO_SANTIAGO_ID,
  rol_esclavo_rayi:
    ROL_ESCLAVO_RAYI_ID,
  rol_omg_bro:
    ROL_OMG_BRO_ID,
};

/* ========================================================================== */
/*                       RECOMPENSAS COMUNES                                  */
/* ========================================================================== */

export const COMMON_LUCKYBOX_REWARDS = [
  {
    texto: "45,000 Frijoles",
    valor: 45000,
    tipo: "positivo",
    probabilidad: "25.0%",
  },
  {
    texto: "60,000 Frijoles",
    valor: 60000,
    tipo: "positivo",
    probabilidad: "20.0%",
  },
  {
    texto: "65,000 Frijoles",
    valor: 65000,
    tipo: "positivo",
    probabilidad: "15.0%",
  },
  {
    texto: "80,000 Frijoles",
    valor: 80000,
    tipo: "positivo",
    probabilidad: "8.0%",
  },
  {
    texto: "100,000 Frijoles",
    valor: 100000,
    tipo: "positivo",
    probabilidad: "3.0%",
  },
  {
    texto: "-20,000 Frijoles",
    valor: -20000,
    tipo: "negativo",
    probabilidad: "20.0%",
  },
  {
    texto: "-25,000 Frijoles",
    valor: -25000,
    tipo: "negativo",
    probabilidad: "9.0%",
  },
] as const satisfies readonly LuckyboxReward[];

/* ========================================================================== */
/*                         RECOMPENSAS RARAS                                  */
/* ========================================================================== */

export const RARE_LUCKYBOX_REWARDS = [
  {
    texto: "350,000 Frijoles",
    valor: 350000,
    tipo: "positivo",
    probabilidad: "25.0%",
  },
  {
    texto: "550,000 Frijoles",
    valor: 550000,
    tipo: "positivo",
    probabilidad: "12.0%",
  },
  {
    texto: `Rol <@&${ROL_SEGURO_ID}>`,
    valor: 0,
    tipo: "rol_seguro",
    probabilidad: "8.0%",
  },
  {
    texto: `Rol <@&${ROL_QUEBRADO_ID}>`,
    valor: 0,
    tipo: "rol_quebrado",
    probabilidad: "1.0%",
  },
  {
    texto: "-150,000 Frijoles",
    valor: -150000,
    tipo: "negativo",
    probabilidad: "34.0%",
  },
  {
    texto: "-250,000 Frijoles",
    valor: -250000,
    tipo: "negativo",
    probabilidad: "20.0%",
  },
] as const satisfies readonly LuckyboxReward[];

/* ========================================================================== */
/*                        RECOMPENSAS ÉPICAS                                  */
/* ========================================================================== */

export const EPIC_LUCKYBOX_REWARDS = [
  {
    texto: "1,200,000 Frijoles",
    valor: 1200000,
    tipo: "positivo",
    probabilidad: "22.0%",
  },
  {
    texto: "1,800,000 Frijoles",
    valor: 1800000,
    tipo: "positivo",
    probabilidad: "12.0%",
  },
  {
    texto: "2,500,000 Frijoles",
    valor: 2500000,
    tipo: "positivo",
    probabilidad: "5.0%",
  },
  {
    texto: `Rol <@&${ROL_ESCLAVO_SADY_ID}>`,
    valor: 0,
    tipo: "rol_esclavo_sady",
    probabilidad: "0.8%",
  },
  {
    texto: `Rol <@&${ROL_ESCLAVO_RAYII_ID}>`,
    valor: 0,
    tipo: "rol_esclavo_rayii",
    probabilidad: "0.2%",
  },
  {
    texto: "-600,000 Frijoles",
    valor: -600000,
    tipo: "negativo",
    probabilidad: "35.0%",
  },
  {
    texto: "-1,000,000 Frijoles",
    valor: -1000000,
    tipo: "negativo",
    probabilidad: "25.0%",
  },
] as const satisfies readonly LuckyboxReward[];

/* ========================================================================== */
/*                        RECOMPENSAS ADMIN                                   */
/* ========================================================================== */

export const ADMIN_LUCKYBOX_REWARDS = [
  {
    texto: "67,000 Frijoles",
    valor: 67000,
    tipo: "positivo",
    probabilidad: "25.0%",
  },
  {
    texto: "75,000 Frijoles",
    valor: 75000,
    tipo: "positivo",
    probabilidad: "20.0%",
  },
  {
    texto: "100,000 Frijoles",
    valor: 100000,
    tipo: "positivo",
    probabilidad: "15.0%",
  },
  {
    texto: "235,000 Frijoles",
    valor: 235000,
    tipo: "positivo",
    probabilidad: "10.0%",
  },
  {
    texto: "500,000 Frijoles",
    valor: 500000,
    tipo: "positivo",
    probabilidad: "5.0%",
  },
  {
    texto: "750,000 Frijoles",
    valor: 750000,
    tipo: "positivo",
    probabilidad: "3.0%",
  },
  {
    texto: "1,000,000 Frijoles",
    valor: 1000000,
    tipo: "positivo",
    probabilidad: "1.8%",
  },
  {
    texto:
      "2,000,000 Frijoles",
    valor: 2000000,
    tipo: "positivo",
    probabilidad: "0.2%",
  },
  {
    texto: `Rol <@&${ROL_ESCLAVO_BAX_ID}>`,
    valor: 0,
    tipo: "rol_esclavo_bax",
    probabilidad: "1.0%",
  },
  {
    texto: `Rol <@&${ROL_ESCLAVO_SANTIAGO_ID}>`,
    valor: 0,
    tipo: "rol_esclavo_santiago",
    probabilidad: "2.0%",
  },
  {
    texto: `Rol <@&${ROL_ESCLAVO_RAYI_ID}>`,
    valor: 0,
    tipo: "rol_esclavo_rayi",
    probabilidad: "3.0%",
  },
  {
    texto:
      `Rol <@&${ROL_OMG_BRO_ID}>`,
    valor: 0,
    tipo: "rol_omg_bro",
    probabilidad: "4.0%",
  },
  {
    texto:
      "-100,000 Frijoles",
    valor: -100000,
    tipo: "negativo",
    probabilidad: "5.0%",
  },
] as const satisfies readonly LuckyboxReward[];

/* ========================================================================== */
/*                           PICK REWARD                                      */
/* ========================================================================== */

export function pickReward(
  cajaNombre: string,
): LuckyboxReward {
  const rand =
    Math.random() * 100;

  const nombreLower =
    cajaNombre.toLowerCase();

  let rewards: readonly LuckyboxReward[];
  let probabilities: readonly number[];

  if (
    nombreLower.includes("admin")
  ) {
    rewards =
      ADMIN_LUCKYBOX_REWARDS;

    probabilities = [
      25.0,
      20.0,
      15.0,
      10.0,
      5.0,
      3.0,
      1.8,
      0.2,
      1.0, 
      2.0, 
      3.0, 
      4.0, 
      5.0,
    ];
  } else if (
    nombreLower.includes("épico") ||
    nombreLower.includes("epico")
  ) {
    rewards =
      EPIC_LUCKYBOX_REWARDS;

    probabilities = [
      22.0,
      12.0,
      5.0,
      0.8,
      0.2,
      35.0,
      25.0,
    ];
  } else if (
    nombreLower.includes("raro")
  ) {
    rewards =
      RARE_LUCKYBOX_REWARDS;

    probabilities = [
      25.0,
      12.0,
      8.0,
      1.0,
      34.0,
      20.0,
    ];
  } else {
    rewards =
      COMMON_LUCKYBOX_REWARDS;

    probabilities = [
      25.0,
      20.0,
      15.0,
      8.0,
      3.0,
      20.0,
      9.0,
    ];
  }

  let acumulado = 0;

  for (
    let i = 0;
    i < rewards.length;
    i++
  ) {
    acumulado +=
      probabilities[i] ?? 0;

    if (
      rand <= acumulado
    ) {
      return rewards[i];
    }
  }

  return rewards[
    rewards.length - 1
  ];
}

/* ========================================================================== */
/*                       NORMALIZAR NOMBRE                                    */
/* ========================================================================== */

function normalizeName(
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

/* ========================================================================== */
/*                       OBTENER ITEM ID                                      */
/* ========================================================================== */

function getLuckyboxItemId(
  cajaNombre: string,
): string | undefined {
  const normalized =
    normalizeName(cajaNombre);

  switch (normalized) {
    case "mr lucky comun":
      return LUCKYBOX_IDS[
        "mr lucky comun"
      ];

    case "mr lucky raro":
      return LUCKYBOX_IDS[
        "mr lucky raro"
      ];

    case "mr lucky epico":
      return LUCKYBOX_IDS[
        "mr lucky epico"
      ];

    case "mr lucky admin":
      return LUCKYBOX_IDS[
        "mr lucky admin"
      ];

    default:
      return undefined;
  }
}

/* ========================================================================== */
/*                         OBTENER REWARDS                                    */
/* ========================================================================== */

function getRewardsArray(
  cajaNombre: string,
): readonly LuckyboxReward[] {
  const lower =
    normalizeName(cajaNombre);

  if (
    lower.includes("admin")
  ) {
    return ADMIN_LUCKYBOX_REWARDS;
  }

  if (
    lower.includes("epico")
  ) {
    return EPIC_LUCKYBOX_REWARDS;
  }

  if (
    lower.includes("raro")
  ) {
    return RARE_LUCKYBOX_REWARDS;
  }

  return COMMON_LUCKYBOX_REWARDS;
}

/* ========================================================================== */
/*                         INVENTARIO                                         */
/* ========================================================================== */

async function getUserInventory(
  guildId: string,
  userId: string,
): Promise<InventoryItem[]> {
  const result =
    await unb.getInventoryItems(
      guildId,
      userId,
    );

  const items =
    (result as any)?.items;

  if (
    Array.isArray(items)
  ) {
    return items;
  }

  return [];
}

async function addInventoryItem(
  guildId: string,
  userId: string,
  itemId: string,
  quantity = 1,
): Promise<void> {
  logger.info(
    {
      guildId,
      userId,
      itemId,
      quantity,
    },
    "Añadiendo Luckybox al inventario mediante UnbelievaBoat.",
  );

  await unb.addInventoryItem(
    guildId,
    userId,
    itemId,
    quantity,
  );
}

async function removeInventoryItem(
  guildId: string,
  userId: string,
  itemId: string,
  quantity = 1,
): Promise<void> {
  logger.info(
    {
      guildId,
      userId,
      itemId,
      quantity,
    },
    "Eliminando Luckybox del inventario.",
  );

  await unb.removeInventoryItem(
    guildId,
    userId,
    itemId,
    quantity,
  );
}

/* ========================================================================== */
/*                    BUSCAR ITEM EN INVENTARIO                               */
/* ========================================================================== */

function findLuckyboxInInventory(
  items: InventoryItem[],
  cajaNombre: string,
): InventoryItem | undefined {
  const expectedId =
    getLuckyboxItemId(
      cajaNombre,
    );

  const targetName =
    normalizeName(cajaNombre);

  return items.find(
    (item) => {
      const itemId = String(
        item.item_id ??
          item.itemId ??
          item.id ??
          "",
      );

      const itemName =
        normalizeName(
          String(
            item.name ??
              item.item_name ??
              "",
          ),
        );

      const quantity =
        Number(
          item.quantity ??
            item.quantiy ??
            item.count ??
            0,
        );

      if (
        quantity <= 0
      ) {
        return false;
      }

      const matchesId =
        Boolean(expectedId) &&
        itemId === expectedId;

      const matchesName =
        itemName ===
          targetName ||
        itemName.includes(
          targetName,
        ) ||
        targetName.includes(
          itemName,
        );

      return (
        matchesId ||
        matchesName
      );
    },
  );
}

/* ========================================================================== */
/*                         TOP CASINO                                         */
/* ========================================================================== */

export async function syncTopCasinoRole(
  guild: Guild,
): Promise<SyncTopCasinoResult> {
  try {
    const leaderboardData =
      await unb.getGuildLeaderboard(
        guild.id,
        {
          limit: 10,
        },
      );

    const topUsers =
      Array.isArray(
        leaderboardData,
      )
        ? leaderboardData
        : (
            leaderboardData as any
          )?.users ?? [];

    if (
      !topUsers ||
      topUsers.length === 0
    ) {
      return {
        success: false,
        added: 0,
        removed: 0,
        error:
          "El leaderboard está vacío o no está disponible.",
      };
    }

    const topUserIds =
      new Set<string>();

    for (
      const userData of topUsers
    ) {
      const userId =
        userData?.user_id ??
        userData?.id;

      if (userId) {
        topUserIds.add(
          String(userId),
        );
      }
    }

    const role =
      await guild.roles.fetch(
        ROL_TOP_CASINO_ID,
      );

    if (!role) {
      return {
        success: false,
        added: 0,
        removed: 0,
        error:
          "El rol Top Casino no existe en este servidor.",
      };
    }

    await guild.members.fetch();

    let addedCount = 0;
    let removedCount = 0;

    for (
      const [, member]
      of role.members
    ) {
      if (
        !topUserIds.has(
          member.id,
        )
      ) {
        try {
          await member.roles.remove(
            role,
            "Ya no forma parte del Top 10 del Casino.",
          );

          removedCount++;
        } catch (err) {
          logger.warn(
            {
              err,
              userId: member.id,
            },
            "No se pudo remover el rol Top Casino.",
          );
        }
      }
    }

    for (
      const userData of topUsers
    ) {
      const userId =
        userData?.user_id ??
        userData?.id;

      if (!userId) {
        continue;
      }

      try {
        const member =
          await guild.members.fetch(
            String(userId),
          );

        if (
          member &&
          !member.roles.cache.has(
            ROL_TOP_CASINO_ID,
          )
        ) {
          await member.roles.add(
            role,
            "¡Entró al Top 10 del Casino!",
          );

          addedCount++;
        }
      } catch (err) {
        logger.warn(
          {
            userId,
            err,
          },
          "No se pudo actualizar el rol de casino para un usuario del top.",
        );
      }
    }

    return {
      success: true,
      added: addedCount,
      removed: removedCount,
    };
  } catch (err: any) {
    logger.error(
      {
        err,
        guildId: guild.id,
      },
      "Error al sincronizar el rol del Top Casino",
    );

    return {
      success: false,
      added: 0,
      removed: 0,
      error:
        err?.message ??
        "Error desconocido",
    };
  }
}

/* ========================================================================== */
/*                       SINCRONIZACIÓN AUTOMÁTICA                            */
/* ========================================================================== */

let isIntervalStarted =
  false;

function startAutoSync(
  clientInstance: any,
): void {
  if (
    isIntervalStarted ||
    !clientInstance
  ) {
    return;
  }

  isIntervalStarted = true;

  setInterval(
    async () => {
      try {
        for (
          const [, guild]
          of clientInstance.guilds
            .cache
        ) {
          await syncTopCasinoRole(
            guild,
          );
        }
      } catch (err) {
        logger.error(
          { err },
          "Error en el intervalo automático de syncTopCasinoRole",
        );
      }
    },
    1000 * 60 * 60,
  );
}

/* ========================================================================== */
/*                         SLASH COMMAND                                      */
/* ========================================================================== */

export const data =
  new SlashCommandBuilder()
    .setName("luckybox")
    .setDescription(
      "Gestioná y abrí tus cajas Mr Lucky.",
    )

    .addSubcommand(
      (subcommand) =>
        subcommand
          .setName("abrir")
          .setDescription(
            "Abrí un Mr Lucky si lo tenés en tu inventario.",
          )
          .addStringOption(
            (option) =>
              option
                .setName("caja")
                .setDescription(
                  "Elegí el tipo de Mr Lucky que querés abrir.",
                )
                .setRequired(true)
                .addChoices(
                  {
                    name:
                      "Mr Lucky Común",
                    value:
                      "Mr Lucky Común",
                  },
                  {
                    name:
                      "Mr Lucky Raro",
                    value:
                      "Mr Lucky Raro",
                  },
                  {
                    name:
                      "Mr Lucky Épico",
                    value:
                      "Mr Lucky Épico",
                  },
                  {
                    name:
                      "Mr Lucky Admin",
                    value:
                      "Mr Lucky Admin",
                  },
                ),
          ),
    )

    .addSubcommand(
      (subcommand) =>
        subcommand
          .setName("info")
          .setDescription(
            "Mirá la información y las recompensas posibles de los Mr Lucky.",
          )
          .addStringOption(
            (option) =>
              option
                .setName("caja")
                .setDescription(
                  "Elegí el tipo de caja del que querés ver la información.",
                )
                .setRequired(true)
                .addChoices(
                  {
                    name:
                      "Mr Lucky Común",
                    value:
                      "Mr Lucky Común",
                  },
                  {
                    name:
                      "Mr Lucky Raro",
                    value:
                      "Mr Lucky Raro",
                  },
                  {
                    name:
                      "Mr Lucky Épico",
                    value:
                      "Mr Lucky Épico",
                  },
                  {
                    name:
                      "MR LUCKY ADMIN",
                    value:
                      "MR LUCKY ADMIN",
                  },
                ),
          ),
    )

    .addSubcommand(
      (subcommand) =>
        subcommand
          .setName("dar")
          .setDescription(
            "Dale una caja Mr Lucky a un usuario autorizado.",
          )
          .addUserOption(
            (option) =>
              option
                .setName("usuario")
                .setDescription(
                  "Elegí al usuario al que le vas a dar la caja.",
                )
                .setRequired(true),
          )
          .addStringOption(
            (option) =>
              option
                .setName("caja")
                .setDescription(
                  "Elegí el tipo de Mr Lucky que querés regalar.",
                )
                .setRequired(true)
                .addChoices(
                  {
                    name:
                      "Mr Lucky Común",
                    value:
                      "Mr Lucky Común",
                  },
                  {
                    name:
                      "Mr Lucky Raro",
                    value:
                      "Mr Lucky Raro",
                  },
                  {
                    name:
                      "Mr Lucky Épico",
                    value:
                      "Mr Lucky Épico",
                  },
                  {
                    name:
                      "MR LUCKY ADMIN",
                    value:
                      "MR LUCKY ADMIN",
                  },
                ),
          ),
    );

/* ========================================================================== */
/*                             HANDLE INFO                                    */
/* ========================================================================== */

async function handleInfo(
  sendReply: ReplyFunction,
  cajaNombre: string,
): Promise<void> {
  const rewards =
    getRewardsArray(
      cajaNombre,
    );

  const MONEDA_EMOJI =
    "<:MonedaServer:1524674026188967956>";

  const formatRewardText = (
    texto: string,
  ): string => {
    return texto.replace(
      /Frijoles/gi,
      MONEDA_EMOJI,
    );
  };

  const positivos =
    rewards
      .filter(
        (reward) =>
          reward.tipo ===
            "positivo" ||
          reward.tipo.startsWith(
            "rol",
          ),
      )
      .map(
        (reward) =>
          `• **${formatRewardText(
            reward.texto,
          )}** — \`${reward.probabilidad}\``,
      )
      .join("\n");

  const negativos =
    rewards
      .filter(
        (reward) =>
          reward.tipo ===
          "negativo",
      )
      .map(
        (reward) =>
          `• **${formatRewardText(
            reward.texto,
          )}** — \`${reward.probabilidad}\``,
      )
      .join("\n");

  const infoEmbed =
    new EmbedBuilder()
      .setColor("Orange")
      .setTitle(
        `📊 Información de recompensas: ${cajaNombre}`,
      )
      .setDescription(
        `Acá tenés los premios y castigos que te pueden tocar al abrir un **${cajaNombre}**, junto con sus respectivas probabilidades.`,
      )
      .addFields(
        {
          name:
            "✨ Recompensas",
          value:
            positivos ||
            "No hay recompensas disponibles.",
          inline: false,
        },
        {
          name:
            "⚠️ Castigos",
          value:
            negativos ||
            "No hay castigos disponibles.",
          inline: false,
        },
      )
      .setFooter({
        text:
          "Sistema de Luckybox • Información oficial",
      })
      .setTimestamp();

  await sendReply({
    embeds: [
      infoEmbed,
    ],
  });
}

/* ========================================================================== */
/*                              HANDLE DAR                                    */
/* ========================================================================== */

async function handleDar(
  sendReply: ReplyFunction,
  guild: Guild,
  moderatorUser: User,
  targetUser: User,
  cajaNombre: string,
): Promise<void> {
  try {
    const member =
      await guild.members
        .fetch(
          moderatorUser.id,
        )
        .catch(
          () => null,
        );

    const hasAuthorizedRole =
      Boolean(member) &&
      member!.roles.cache.some(
        (role) =>
          AUTHORIZED_ROLES.includes(
            role.id,
          ),
      );

    if (
      !hasAuthorizedRole
    ) {
      await sendReply({
        content:
          "❌ No tenés ninguno de los roles autorizados para usar este comando.",
        flags:
          MessageFlags.Ephemeral,
      });

      return;
    }

    if (
      moderatorUser.id ===
      targetUser.id
    ) {
      await sendReply({
        content:
          "❌ No te podés regalar una caja a vos mismo, tramposo de mierda.",
        flags:
          MessageFlags.Ephemeral,
      });

      return;
    }

    const itemId =
      getLuckyboxItemId(
        cajaNombre,
      );

    if (!itemId) {
      await sendReply({
        content:
          "❌ La caja que especificaste no tiene configurado un ID válido de UnbelievaBoat.",
        flags:
          MessageFlags.Ephemeral,
      });

      return;
    }

    logger.info(
      {
        guildId:
          guild.id,
        userId:
          targetUser.id,
        itemId,
        cajaNombre,
      },
      "INTENTANDO DAR ITEM MEDIANTE UNBELIEVABOAT",
    );

    await addInventoryItem(
      guild.id,
      targetUser.id,
      itemId,
      1,
    );

    logger.info(
      {
        guildId:
          guild.id,
        userId:
          targetUser.id,
        itemId,
      },
      "ITEM AÑADIDO CORRECTAMENTE AL INVENTARIO.",
    );

    const embed =
      new EmbedBuilder()
        .setColor("Green")
        .setTitle(
          "🎁 ¡Caja entregada!",
        )
        .setDescription(
          `El usuario <@${moderatorUser.id}> le entregó un **${cajaNombre}** a <@${targetUser.id}>.`,
        )
        .addFields({
          name:
            "📦 Item entregado",
          value:
            `**${cajaNombre}**\nID: \`${itemId}\``,
          inline: false,
        })
        .setTimestamp();

    await sendReply({
      embeds: [
        embed,
      ],
    });
  } catch (err: any) {
    logger.error(
      {
        err,
        guildId:
          guild.id,
        targetUserId:
          targetUser.id,
        cajaNombre,
      },
      "Error al dar item de mr lucky.",
    );

    await sendReply({
      content:
        `⚠️ No se pudo añadir el item mediante UnbelievaBoat.\n\n\`${err?.message ?? "Error desconocido"}\``,
      flags:
        MessageFlags.Ephemeral,
    });
  }
}

/* ========================================================================== */
/*                             HANDLE ABRIR                                   */
/* ========================================================================== */

async function handleAbrir(
  sendReply: ReplyFunction,
  sendChannelMessage: ReplyFunction,
  guild: Guild,
  targetUser: User,
  cajaNombre: string,
): Promise<void> {
  try {
    const guildId =
      guild.id;

    const userId =
      targetUser.id;

    let items: InventoryItem[];

    try {
      items =
        await getUserInventory(
          guildId,
          userId,
        );

      logger.info(
        {
          guildId,
          userId,
          itemCount:
            items.length,
        },
        "Inventario UnbelievaBoat obtenido correctamente.",
      );
    } catch (err) {
      logger.error(
        {
          err,
          guildId,
          userId,
        },
        "Error consultando inventario UnbelievaBoat.",
      );

      throw new Error(
        "No se pudo consultar tu inventario de UnbelievaBoat.",
      );
    }

    const userBox =
      findLuckyboxInInventory(
        items,
        cajaNombre,
      );

    if (!userBox) {
      await sendReply({
        content:
          `❌ No tenés ningún **${cajaNombre}** en tu inventario.`,
      });

      return;
    }

    const itemId =
      String(
        userBox.item_id ??
          userBox.itemId ??
          userBox.id ??
          "",
      );

    if (!itemId) {
      throw new Error(
        "La Luckybox encontrada no tiene un ID de item válido.",
      );
    }

    await removeInventoryItem(
      guildId,
      userId,
      itemId,
      1,
    );

    logger.info(
      {
        guildId,
        userId,
        itemId,
        cajaNombre,
      },
      "Luckybox consumida correctamente.",
    );

    const reward =
      pickReward(
        cajaNombre,
      );

    let rewardDescription =
      reward.texto;

    const rewardRoleId =
      ROLE_MAP[
        reward.tipo
      ];

    const member =
      await guild.members
        .fetch(userId)
        .catch(
          () => null,
        );

    if (
      rewardRoleId &&
      member
    ) {
      const role =
        await guild.roles
          .fetch(
            rewardRoleId,
          )
          .catch(
            () => null,
          );

      if (!role) {
        logger.error(
          {
            roleId:
              rewardRoleId,
            userId,
          },
          "El rol de recompensa no existe.",
        );

        rewardDescription =
          `${reward.texto}\n⚠️ El rol no existe en el servidor.`;
      } else {
        try {
          await member.roles.add(
            role,
            "Premio de caja Luckybox.",
          );

          rewardDescription =
            `Rol <@&${rewardRoleId}>`;
        } catch (err) {
          logger.error(
            {
              err,
              roleId:
                rewardRoleId,
              userId,
            },
            "No se pudo entregar el rol de recompensa.",
          );

          rewardDescription =
            `${reward.texto}\n⚠️ No se pudo asignar automáticamente el rol.`;
        }
      }
    } else if (
      reward.valor !== 0
    ) {
      await unb.editUserBalance(
        guildId,
        userId,
        {
          cash:
            reward.valor,
        },
      );
    }

    const embed =
      new EmbedBuilder()
        .setColor("Orange")
        .setTitle(
          `🎁 ${cajaNombre} abierta`,
        )
        .setDescription(
          `¡<@${userId}> abrió su **${cajaNombre}**!`,
        )
        .addFields(
          {
            name:
              "📦 Tipo de item",
            value:
              `\`${cajaNombre}\``,
            inline: true,
          },
          {
            name:
              "🎉 Premio/castigo obtenido",
            value:
              rewardDescription,
            inline: false,
          },
          {
            name:
              "💸 Estado",
            value:
              "El item fue validado en tu inventario y el resultado se aplicó a tu cuenta.",
            inline: false,
          },
        )
        .setFooter({
          text:
            "Sistema de Luckybox • Inventario verificado",
        })
        .setTimestamp();

    await sendReply({
      content:
        "✅ ¡Luckybox abierta con éxito!",
    });

    await sendChannelMessage({
      embeds: [
        embed,
      ],
    });
  } catch (err: any) {
    logger.error(
      {
        err,
        guildId:
          guild.id,
        targetUserId:
          targetUser.id,
        cajaNombre,
      },
      "Error validando inventario para Mr Lucky.",
    );

    await sendReply({
      content:
        `❌ **No se pudo verificar tu inventario:**\n\`${err?.message ?? "Error desconocido"}\``,
    });
  }
}

/* ========================================================================== */
/*                         SLASH EXECUTE                                      */
/* ========================================================================== */

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (
    interaction.client
  ) {
    startAutoSync(
      interaction.client,
    );
  }

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

  const cajaNombre =
    interaction.options.getString(
      "caja",
      true,
    );

  if (
    subcommand === "info"
  ) {
    await interaction.deferReply(
      {
        flags:
          MessageFlags.Ephemeral,
      },
    );

    await handleInfo(
      (options) =>
        interaction.editReply(
          options,
        ),
      cajaNombre,
    );

    return;
  }

  if (
    subcommand === "dar"
  ) {
    const targetUser =
      interaction.options.getUser(
        "usuario",
        true,
      );

    await interaction.deferReply(
      {
        flags:
          MessageFlags.Ephemeral,
      },
    );

    await handleDar(
      (options) =>
        interaction.editReply(
          options,
        ),
      interaction.guild,
      interaction.user,
      targetUser,
      cajaNombre,
    );

    return;
  }

  await interaction.deferReply(
    {
      flags:
        MessageFlags.Ephemeral,
    },
  );

  const channel =
    interaction.channel;

  if (
    !channel ||
    !("send" in channel)
  ) {
    await interaction.editReply({
      content:
        "❌ No se pudo obtener un canal válido para mostrar el resultado.",
    });

    return;
  }

  await handleAbrir(
    (options) =>
      interaction.editReply(
        options,
      ),
    (options) =>
      channel.send(
        options,
      ),
    interaction.guild,
    interaction.user,
    cajaNombre,
  );
}

/* ========================================================================== */
/*                           PREFIX COMMAND                                   */
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

  if (
    message.client
  ) {
    startAutoSync(
      message.client,
    );
  }

  const mainArg =
    (
      args[0] ?? ""
    ).toLowerCase();

  const validSubcommands =
    [
      "abrir",
      "info",
      "dar",
    ] as const;

  const isSubcommand =
    validSubcommands.includes(
      mainArg as
        | "abrir"
        | "info"
        | "dar",
    );

  if (
    args.length === 0 ||
    !isSubcommand
  ) {
    await message.reply(
      "❌ Uso incorrecto. Tenés que usar `-luckybox abrir`, `-luckybox info` o `-luckybox dar`.",
    );

    return;
  }

  const sub =
    mainArg as
      | "abrir"
      | "info"
      | "dar";

  const offset = 1;

  const normalizeCaja =
    (value: string): string => {
      return value
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(
          /[\u0300-\u036f]/g,
          "",
        );
    };

  const validCajas: Record<
    string,
    string
  > = {
    comun:
      "Mr Lucky Común",
    raro:
      "Mr Lucky Raro",
    epico:
      "Mr Lucky Épico",
    admin:
      "MR LUCKY ADMIN",
  };

  const getCajaNombre =
    (
      rawCaja: string,
    ): string | null => {
      const normalized =
        normalizeCaja(
          rawCaja,
        );

      return (
        validCajas[
          normalized
        ] ?? null
      );
    };

  const opcionesValidas =
    "común, raro, épico y admin";

  if (
    sub === "dar"
  ) {
    const mentionedUser =
      message.mentions.users.first();

    if (!mentionedUser) {
      await message.reply(
        "❌ Uso correcto: `-luckybox dar [caja] @usuario`.",
      );

      return;
    }

    const cajaNombreRestante =
      args
        .slice(
          offset,
        )
        .filter(
          (arg) =>
            !/^<@!?\d+>$/.test(
              arg,
            ),
        )
        .join(" ")
        .trim();

    if (
      !cajaNombreRestante
    ) {
      await message.reply(
        "❌ Uso correcto: `-luckybox dar [caja] @usuario`.",
      );

      return;
    }

    const cajaNombre =
      getCajaNombre(
        cajaNombreRestante,
      );

    if (!cajaNombre) {
      await message.reply(
        `❌ Esa caja no existe. Las opciones válidas son: ${opcionesValidas}.`,
      );

      return;
    }

    await handleDar(
      (options) =>
        message.reply(
          options,
        ),
      message.guild,
      message.author,
      mentionedUser,
      cajaNombre,
    );

    return;
  }

  const cajaNombreRestante =
    args
      .slice(offset)
      .join(" ")
      .trim();

  if (
    !cajaNombreRestante
  ) {
    await message.reply(
      `❌ Uso correcto: \`-luckybox info [caja]\`.\nLas cajas disponibles son: ${opcionesValidas}.`,
    );

    return;
  }

  const cajaNombre =
    getCajaNombre(
      cajaNombreRestante,
    );

  if (!cajaNombre) {
    await message.reply(
      `❌ Esa caja no existe. Las opciones válidas son: ${opcionesValidas}.`,
    );

    return;
  }

  if (
    sub === "info"
  ) {
    await handleInfo(
      (options) =>
        message.reply(
          options,
        ),
      cajaNombre,
    );

    return;
  }

  if (
    !cajaNombreRestante
  ) {
    await message.reply(
      "❌ Uso correcto: `-luckybox abrir [caja]`.",
    );

    return;
  }

  const cajaNombreAbrir =
    getCajaNombre(
      cajaNombreRestante,
    );

  if (!cajaNombreAbrir) {
    await message.reply(
      `❌ Esa caja no existe. Las opciones válidas son: ${opcionesValidas}.`,
    );

    return;
  }

  const channel =
    message.channel;

  if (
    !channel ||
    !("send" in channel)
  ) {
    await message.reply(
      "❌ No se pudo obtener un canal válido para mostrar el resultado.",
    );

    return;
  }

  await handleAbrir(
    (options) =>
      message.reply(
        options,
      ),
    (options) =>
      channel.send(
        options,
      ),
    message.guild,
    message.author,
    cajaNombreAbrir,
  );
}
