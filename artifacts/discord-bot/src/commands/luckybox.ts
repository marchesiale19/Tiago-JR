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

import {
  readFile,
  writeFile,
  mkdir,
  rename,
} from "node:fs/promises";

import path from "node:path";

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

const unb = new UnbClient(UNBELIEVABOAT_API_KEY);

const LUCKYBOX_LOG_CHANNEL_ID =
  "1555430585403703396";

/* ========================================================================== */
/*                              IDS DE ROLES                                  */
/* ========================================================================== */

const ROL_SEGURO_ID =
  "1461499864457412865";

const ROL_QUEBRADO_ID =
  "1478210697199353976";

const ROL_ESCLAVO_SADY_ID =
  "1478210995066372337";

const ROL_ESCLAVO_RAYII_ID =
  "1478210926883639456";

const ROL_ESCLAVO_BAX_ID =
  "1461517408203313244";

const ROL_ESCLAVO_SANTIAGO_ID =
  "1461961845513519187";

const ROL_ESCLAVO_RAYI_ID =
  "1478210926883639456";

const ROL_OMG_BRO_ID =
  "1478217120465555630";

const ROL_TOP_CASINO_ID =
  "1546068235072442398";

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
/*                        CONFIGURACIÓN COLLECT                               */
/* ========================================================================== */

export const COLLECT_COOLDOWN_MS =
  6 * 24 * 60 * 60 * 1000;

const COLLECT_COOLDOWN_FILE =
  path.join(
    process.cwd(),
    "data",
    "luckybox-collect-cooldowns.json",
  );

type CollectCooldownStore =
  Record<string, number>;

let collectCooldownStore:
  CollectCooldownStore = {};

let collectCooldownStoreLoaded =
  false;

let collectCooldownStoreLoadPromise:
  Promise<void> | null = null;

let collectCooldownWriteQueue:
  Promise<void> = Promise.resolve();

/* ========================================================================== */
/*                        ROLES ESPECIALES COLLECT                            */
/* ========================================================================== */

export const COLLECT_ROLES = {
  EXITOSO: {
    roleId: "1525558889779822664",
    roleName: "👑ヽEXITOSO",
    rewards: [
      {
        cajaNombre: "Mr Lucky Común",
        quantity: 1,
      },
    ],
  },

  MEJOR_MIEMBRO: {
    roleId: "1525558946272772247",
    roleName: "⭐️ヽMEJOR MIEMBRO",
    rewards: [
      {
        cajaNombre: "Mr Lucky Raro",
        quantity: 1,
      },
    ],
  },

  MIEMBRO_DEL_MES: {
    roleId: "1545147355928600597",
    roleName: "🌟ヽMIEMBRO DEL MES",
    rewards: [
      {
        cajaNombre: "Mr Lucky Épico",
        quantity: 1,
      },
    ],
  },

  CAMPEON: {
    roleId: "1528916496213086310",
    roleName: "🏆 ヽCAMPEON",
    rewards: [
      {
        cajaNombre: "Mr Lucky Épico",
        quantity: 1,
      },
      {
        cajaNombre: "Mr Lucky Raro",
        quantity: 1,
      },
    ],
  },
} as const;

/* ========================================================================== */
/*                           IDS DE LUCKYBOX                                  */
/* ========================================================================== */

const LUCKYBOX_IDS: Record<string, string> = {
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

export const AUTHORIZED_ROLES: readonly string[] = [
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
/*                       ROLES AUTORIZADOS PARA DROP                          */
/* ========================================================================== */

const LUCKYBOX_DROP_AUTHORIZED_ROLES:
  readonly string[] = [
    "1539368076326473868", // Developer Tiago Jr
    "1522807097920720967", // Manager
  ];

/* ========================================================================== */
/*                         CONFIGURACIÓN DROP                                 */
/* ========================================================================== */

const LUCKYBOX_DROP_BUTTON_PREFIX =
  "luckybox_drop_claim";

const LUCKYBOX_DROP_ORANGE =
  0xFFA500;

const LUCKYBOX_DROP_GREEN =
  0x57F287;

/*
 * Estado en memoria de los drops activos.
 *
 * La clave es el dropId.
 *
 * Esto evita que dos usuarios puedan reclamar
 * simultáneamente la misma Luckybox dentro de
 * la misma instancia del bot.
 */
interface ActiveLuckyboxDrop {
  readonly dropId: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly cajaNombre: string;
  readonly itemId: string;

  claimed: boolean;
  claimedBy?: string;
}

const activeLuckyboxDrops =
  new Map<
    string,
    ActiveLuckyboxDrop
  >();

/* ========================================================================== */
/*                             MAPA DE ROLES                                  */
/* ========================================================================== */

const ROLE_MAP: Record<string, string> = {
  rol_seguro: ROL_SEGURO_ID,
  rol_quebrado: ROL_QUEBRADO_ID,
  rol_esclavo_sady: ROL_ESCLAVO_SADY_ID,
  rol_esclavo_rayii: ROL_ESCLAVO_RAYII_ID,
  rol_esclavo_bax: ROL_ESCLAVO_BAX_ID,
  rol_esclavo_santiago: ROL_ESCLAVO_SANTIAGO_ID,
  rol_esclavo_rayi: ROL_ESCLAVO_RAYI_ID,
  rol_omg_bro: ROL_OMG_BRO_ID,
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
    texto: "2,000,000 Frijoles",
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
    texto: `Rol <@&${ROL_OMG_BRO_ID}>`,
    valor: 0,
    tipo: "rol_omg_bro",
    probabilidad: "4.0%",
  },
  {
    texto: "-100,000 Frijoles",
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
  const rand = Math.random() * 100;
  const nombreLower = cajaNombre.toLowerCase();

  let rewards: readonly LuckyboxReward[];
  let probabilities: readonly number[];

  if (nombreLower.includes("admin")) {
    rewards = ADMIN_LUCKYBOX_REWARDS;
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
    rewards = EPIC_LUCKYBOX_REWARDS;
    probabilities = [
      22.0,
      12.0,
      5.0,
      0.8,
      0.2,
      35.0,
      25.0,
    ];
  } else if (nombreLower.includes("raro")) {
    rewards = RARE_LUCKYBOX_REWARDS;
    probabilities = [
      25.0,
      12.0,
      8.0,
      1.0,
      34.0,
      20.0,
    ];
  } else {
    rewards = COMMON_LUCKYBOX_REWARDS;
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

  for (let i = 0; i < rewards.length; i++) {
    acumulado += probabilities[i] ?? 0;

    if (rand <= acumulado) {
      return rewards[i];
    }
  }

  return rewards[rewards.length - 1];
}

/* ========================================================================== */
/*                       NORMALIZAR NOMBRE                                    */
/* ========================================================================== */

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* ========================================================================== */
/*                       OBTENER ITEM ID                                      */
/* ========================================================================== */

function getLuckyboxItemId(
  cajaNombre: string,
): string | undefined {
  const normalized = normalizeName(cajaNombre);

  switch (normalized) {
    case "mr lucky comun":
      return LUCKYBOX_IDS["mr lucky comun"];

    case "mr lucky raro":
      return LUCKYBOX_IDS["mr lucky raro"];

    case "mr lucky epico":
      return LUCKYBOX_IDS["mr lucky epico"];

    case "mr lucky admin":
      return LUCKYBOX_IDS["mr lucky admin"];

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
  const lower = normalizeName(cajaNombre);

  if (lower.includes("admin")) {
    return ADMIN_LUCKYBOX_REWARDS;
  }

  if (lower.includes("epico")) {
    return EPIC_LUCKYBOX_REWARDS;
  }

  if (lower.includes("raro")) {
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
  const result = await unb.getInventoryItems(
    guildId,
    userId,
  );

  const items = (result as any)?.items;

  return Array.isArray(items) ? items : [];
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
    getLuckyboxItemId(cajaNombre);

  const targetName =
    normalizeName(cajaNombre);

  return items.find((item) => {
    const itemId = String(
      item.item_id ??
        item.itemId ??
        item.id ??
        "",
    );

    const itemName = normalizeName(
      String(
        item.name ??
          item.item_name ??
          "",
      ),
    );

    const quantity = Number(
      item.quantity ??
        item.quantiy ??
        item.count ??
        0,
    );

    if (quantity <= 0) {
      return false;
    }

    const matchesId =
      Boolean(expectedId) &&
      itemId === expectedId;

    const matchesName =
      itemName === targetName ||
      itemName.includes(targetName) ||
      targetName.includes(itemName);

    return matchesId || matchesName;
  });
}

/* ========================================================================== */
/*                         LOGS DE LUCKYBOX                                   */
/* ========================================================================== */

async function sendLuckyboxLog(
  guild: Guild,
  moderatorUser: User,
  targetUser: User,
  cajaNombre: string,
): Promise<void> {
  try {
    const channel =
      await guild.client.channels.fetch(
        LUCKYBOX_LOG_CHANNEL_ID,
      );

    if (!channel || !channel.isTextBased()) {
      logger.warn(
        {
          channelId:
            LUCKYBOX_LOG_CHANNEL_ID,
        },
        "No se pudo encontrar un canal de logs válido para Luckybox.",
      );

      return;
    }

    const logEmbed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle(
        "🎁 Registro de entrega de Luckybox",
      )
      .setDescription(
        `<@${moderatorUser.id}> le dio un **${cajaNombre}** a <@${targetUser.id}>.`,
      )
      .addFields(
        {
          name: "👤 Usuario Emisor",
          value:
            `<@${moderatorUser.id}>\nID: \`${moderatorUser.id}\``,
          inline: true,
        },
        {
          name: "🎯 Usuario Objetivo",
          value:
            `<@${targetUser.id}>\nID: \`${targetUser.id}\``,
          inline: true,
        },
        {
          name: "📦 Tipo de Caja",
          value: `**${cajaNombre}**`,
          inline: false,
        },
        {
          name: "🌐 Servidor de Origen",
          value:
            `**${guild.name}**\nID: \`${guild.id}\``,
          inline: false,
        },
      )
      .setFooter({
        text:
          "Sistema de Luckybox • Registro de auditoría",
      })
      .setTimestamp();

    await channel.send({
      embeds: [logEmbed],
    });
  } catch (err) {
    logger.error(
      {
        err,
        channelId:
          LUCKYBOX_LOG_CHANNEL_ID,
        guildId: guild.id,
        moderatorUserId:
          moderatorUser.id,
        targetUserId:
          targetUser.id,
        cajaNombre,
      },
      "No se pudo enviar el log de auditoría de Luckybox.",
    );
  }
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

    const topUsers = Array.isArray(
      leaderboardData,
    )
      ? leaderboardData
      : (leaderboardData as any)?.users ?? [];

    if (!topUsers || topUsers.length === 0) {
      return {
        success: false,
        added: 0,
        removed: 0,
        error:
          "El leaderboard está vacío o no está disponible.",
      };
    }

    const topUserIds = new Set<string>();

    for (const userData of topUsers) {
      const userId =
        userData?.user_id ??
        userData?.id;

      if (userId) {
        topUserIds.add(String(userId));
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

    for (const [, member] of role.members) {
      if (!topUserIds.has(member.id)) {
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

    for (const userData of topUsers) {
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

let isIntervalStarted = false;

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
          const [, guild] of clientInstance.guilds.cache
        ) {
          await syncTopCasinoRole(guild);
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
/*                     LUCKYBOX DROP - HELPERS                               */
/* ========================================================================== */

function hasLuckyboxDropPermission(
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
  return LUCKYBOX_DROP_AUTHORIZED_ROLES.some(
    (roleId) =>
      member.roles.cache.has(
        roleId,
      ),
  );
}

function createLuckyboxDropEmbed(
  cajaNombre: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(
      LUCKYBOX_DROP_ORANGE,
    )
    .setTitle(
      "🎁 ¡Luckybox soltada!",
    )
    .setDescription(
      `¡Se ha soltado una **${cajaNombre}**!\n\n` +
      `El primero en presionar **Reclamar** se queda con la caja.`,
    )
    .addFields({
      name: "📦 Caja",
      value:
        `**${cajaNombre}**`,
      inline: true,
    })
    .setFooter({
      text:
        "Sistema de Luckybox • Drop disponible",
    })
    .setTimestamp();
}

function createLuckyboxDropButton(
  dropId: string,
  disabled = false,
): ActionRowBuilder<ButtonBuilder> {
  const button =
    new ButtonBuilder()
      .setCustomId(
        `${LUCKYBOX_DROP_BUTTON_PREFIX}:${dropId}`,
      )
      .setLabel("Reclamar")
      .setEmoji("🎁")
      .setStyle(
        ButtonStyle.Primary,
      )
      .setDisabled(disabled);

  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(button);
}

function createLuckyboxClaimedEmbed(
  cajaNombre: string,
  user: User,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(
      LUCKYBOX_DROP_GREEN,
    )
    .setTitle(
      "🎁 ¡Luckybox reclamada!",
    )
    .setDescription(
      `La **${cajaNombre}** fue reclamada correctamente.`,
    )
    .addFields(
      {
        name: "📦 Caja",
        value:
          `**${cajaNombre}**`,
        inline: true,
      },
      {
        name: "👤 Reclamada por",
        value:
          `<@${user.id}>`,
        inline: true,
      },
      {
        name: "✅ Estado",
        value:
          "`RECLAMADA`",
        inline: false,
      },
    )
    .setFooter({
      text:
        "Sistema de Luckybox • Drop finalizado",
    })
    .setTimestamp();
}

/* ========================================================================== */
/*                       HANDLE LUCKYBOX DROP                                 */
/* ========================================================================== */

async function handleLuckyboxDrop(
  sendReply: ReplyFunction,
  guild: Guild,
  moderatorUser: User,
  cajaNombre: string,
  targetChannel: {
    send: (options: any) => Promise<any>;
  },
): Promise<void> {
  try {
    const member =
      await guild.members
        .fetch(moderatorUser.id)
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
      !hasLuckyboxDropPermission(
        member,
      )
    ) {
      await sendReply({
        content:
          "❌ No tenés un rol autorizado para gestionar las luckyboxes",
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

    const dropId =
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;

    const embed =
      createLuckyboxDropEmbed(
        cajaNombre,
      );

    const row =
      createLuckyboxDropButton(
        dropId,
      );

    const dropMessage =
      await targetChannel.send({
        embeds: [embed],
        components: [row],
      });

    activeLuckyboxDrops.set(
      dropId,
      {
        dropId,
        guildId: guild.id,
        channelId:
          dropMessage.channelId,
        messageId:
          dropMessage.id,
        cajaNombre,
        itemId,
        claimed: false,
      },
    );

    await sendReply({
      content:
        `✅ La **${cajaNombre}** fue soltada correctamente en <#${dropMessage.channelId}>.`,
      flags:
        MessageFlags.Ephemeral,
    });

    logger.info(
      {
        guildId: guild.id,
        moderatorUserId:
          moderatorUser.id,
        cajaNombre,
        itemId,
        dropId,
        messageId:
          dropMessage.id,
        channelId:
          dropMessage.channelId,
      },
      "Luckybox drop creado correctamente.",
    );
  } catch (err) {
    logger.error(
      {
        err,
        guildId: guild.id,
        moderatorUserId:
          moderatorUser.id,
        cajaNombre,
      },
      "Error creando Luckybox drop.",
    );

    await sendReply({
      content:
        "❌ No se pudo crear la Luckybox.",
      flags:
        MessageFlags.Ephemeral,
    });
  }
}

/* ========================================================================== */
/*                     HANDLE BOTÓN RECLAMAR                                  */
/* ========================================================================== */

export async function handleLuckyboxDropButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const dropId =
    interaction.customId.slice(
      `${LUCKYBOX_DROP_BUTTON_PREFIX}:`
        .length,
    );

  if (!dropId) {
    await interaction.reply({
      content:
        "❌ Este botón de Luckybox no es válido.",
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
        "❌ Este botón solamente puede utilizarse en un servidor.",
      flags:
        MessageFlags.Ephemeral,
    });
    return;
  }

  const drop =
    activeLuckyboxDrops.get(
      dropId,
    );

  if (!drop) {
    await interaction.reply({
      content:
        "❌ Esta Luckybox ya no está disponible. Es posible que el bot haya sido reiniciado.",
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
        "❌ Esta Luckybox pertenece a otro servidor.",
      flags:
        MessageFlags.Ephemeral,
    });
    return;
  }

  if (drop.claimed) {
    await interaction.reply({
      content:
        "❌ Esta Luckybox ya fue reclamada por otro usuario.",
      flags:
        MessageFlags.Ephemeral,
    });
    return;
  }

  // Marcamos como reclamado de inmediato en memoria
  drop.claimed = true;
  drop.claimedBy =
    interaction.user.id;

  // Diferimos la actualización para evitar el timeout de Discord
  await interaction.deferUpdate();

  try {
    // 1. Añadimos el item al inventario de UnbelievaBoat
    await addInventoryItem(
      interaction.guildId,
      interaction.user.id,
      drop.itemId,
      1,
    );

    logger.info(
      {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        cajaNombre: drop.cajaNombre,
        itemId: drop.itemId,
        dropId: drop.dropId,
      },
      "Luckybox drop reclamada y entregada correctamente.",
    );

    activeLuckyboxDrops.delete(drop.dropId);

    // 2. Actualizamos el mensaje visualmente indicando quién la reclamó
    const claimedEmbed =
      createLuckyboxClaimedEmbed(
        drop.cajaNombre,
        interaction.user,
      );

    const disabledRow =
      createLuckyboxDropButton(
        drop.dropId,
        true,
      );

    await interaction.editReply({
      embeds: [
        claimedEmbed,
      ],
      components: [
        disabledRow,
      ],
    });

    // 3. Enviamos un mensaje oculto (ephemeral) de confirmación al usuario
    await interaction.followUp({
      content: `🎉 ¡Felicidades <@${interaction.user.id}>! Reclamaste exitosamente un/a **${drop.cajaNombre}** y se añadió a tu inventario de UnbelievaBoat.`,
      flags: MessageFlags.Ephemeral,
    });

  } catch (err) {
    // Si falla la API de UnbelievaBoat o la edición, revertimos el estado
    drop.claimed = false;
    drop.claimedBy = undefined;

    logger.error(
      {
        err,
        guildId: interaction.guildId,
        userId: interaction.user.id,
        cajaNombre: drop.cajaNombre,
        itemId: drop.itemId,
        dropId: drop.dropId,
      },
      "Falló la entrega de la Luckybox reclamada mediante el drop.",
    );

    try {
      await interaction.followUp({
        content: "❌ Hubo un error al añadir la caja a tu inventario mediante UnbelievaBoat. Inténtalo de nuevo.",
        flags: MessageFlags.Ephemeral,
      });
    } catch (followUpErr) {
      logger.error({ followUpErr }, "No se pudo enviar el mensaje de error por followUp.");
    }
  }
}

/* ========================================================================== */
/*                     PERSISTENCIA DE COOLDOWN                               */
/* ========================================================================== */

async function loadCollectCooldowns(): Promise<void> {
  if (collectCooldownStoreLoaded) {
    return;
  }

  if (collectCooldownStoreLoadPromise) {
    return collectCooldownStoreLoadPromise;
  }

  collectCooldownStoreLoadPromise =
    (async () => {
      try {
        const raw =
          await readFile(
            COLLECT_COOLDOWN_FILE,
            "utf8",
          );

        const parsed = JSON.parse(raw);

        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          collectCooldownStore =
            parsed as CollectCooldownStore;
        } else {
          collectCooldownStore = {};
        }
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          logger.warn(
            {
              err,
              file:
                COLLECT_COOLDOWN_FILE,
            },
            "No se pudo leer el archivo de cooldown de -collect. Se iniciará uno nuevo.",
          );
        }

        collectCooldownStore = {};
      } finally {
        collectCooldownStoreLoaded = true;
        collectCooldownStoreLoadPromise = null;
      }
    })();

  return collectCooldownStoreLoadPromise;
}

function getCollectCooldownKey(
  guildId: string,
  userId: string,
): string {
  return `${guildId}:${userId}`;
}

async function saveCollectCooldowns(): Promise<void> {
  collectCooldownWriteQueue =
    collectCooldownWriteQueue.then(
      async () => {
        const directory =
          path.dirname(
            COLLECT_COOLDOWN_FILE,
          );

        await mkdir(directory, {
          recursive: true,
        });

        const temporaryFile =
          `${COLLECT_COOLDOWN_FILE}.tmp`;

        await writeFile(
          temporaryFile,
          JSON.stringify(
            collectCooldownStore,
            null,
            2,
          ),
          "utf8",
        );

        await rename(
          temporaryFile,
          COLLECT_COOLDOWN_FILE,
        );
      },
    ).catch((err) => {
      logger.error(
        {
          err,
          file:
            COLLECT_COOLDOWN_FILE,
        },
        "No se pudo guardar el cooldown de -collect.",
      );
    });

  return collectCooldownWriteQueue;
}

function getRemainingCollectCooldown(
  guildId: string,
  userId: string,
  now = Date.now(),
): number {
  const key =
    getCollectCooldownKey(
      guildId,
      userId,
    );

  const lastCollect =
    collectCooldownStore[key];

  if (
    !lastCollect ||
    !Number.isFinite(lastCollect)
  ) {
    return 0;
  }

  return Math.max(
    0,
    COLLECT_COOLDOWN_MS -
      (now - lastCollect),
  );
}

function formatCollectRemaining(
  milliseconds: number,
): string {
  const totalSeconds =
    Math.ceil(
      milliseconds / 1000,
    );

  const days =
    Math.floor(
      totalSeconds / 86400,
    );

  const hours =
    Math.floor(
      (totalSeconds % 86400) /
        3600,
    );

  const minutes =
    Math.floor(
      (totalSeconds % 3600) /
        60,
    );

  const seconds =
    totalSeconds % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(
      `${days} día${
        days === 1 ? "" : "s"
      }`,
    );
  }

  if (
    hours > 0 ||
    days > 0
  ) {
    parts.push(
      `${hours} hora${
        hours === 1 ? "" : "s"
      }`,
    );
  }

  if (
    minutes > 0 ||
    hours > 0 ||
    days > 0
  ) {
    parts.push(
      `${minutes} minuto${
        minutes === 1 ? "" : "s"
      }`,
    );
  }

  if (
    seconds > 0 ||
    parts.length === 0
  ) {
    parts.push(
      `${seconds} segundo${
        seconds === 1 ? "" : "s"
      }`,
    );
  }

  return parts.join(", ");
}

/* ========================================================================== */
/*                    RESOLVER ROLES COLLECT                                  */
/* ========================================================================== */

function getCollectRolesForMember(
  member: {
    roles: {
      cache: {
        has: (
          roleId: string,
        ) => boolean;
      };
    };
  },
) {
  return Object.values(
    COLLECT_ROLES,
  ).filter(
    (collectRole) =>
      member.roles.cache.has(
        collectRole.roleId,
      ),
  );
}

/* ========================================================================== */
/*                     CONSTRUIR RECOMPENSAS COLLECT                          */
/* ========================================================================== */

function getCollectRewards(
  collectRoles: readonly {
    roleId: string;
    roleName: string;
    rewards: readonly {
      cajaNombre: string;
      quantity: number;
    }[];
  }[],
) {
  const rewards: Array<{
    itemId: string;
    quantity: number;
    cajaNombre: string;
    roleId: string;
    roleName: string;
  }> = [];

  for (const collectRole of collectRoles) {
    for (const reward of collectRole.rewards) {
      const itemId =
        getLuckyboxItemId(
          reward.cajaNombre,
        );

      if (!itemId) {
        throw new Error(
          `La caja "${reward.cajaNombre}" no tiene un ID válido configurado.`,
        );
      }

      rewards.push({
        itemId,
        quantity: reward.quantity,
        cajaNombre: reward.cajaNombre,
        roleId: collectRole.roleId,
        roleName: collectRole.roleName,
      });
    }
  }

  return rewards;
}

/* ========================================================================== */
/*                         HANDLE COLLECT                                     */
/* ========================================================================== */

async function handleCollect(
  guild: Guild,
  user: User,
  sendReply: ReplyFunction,
): Promise<void> {
  try {
    await loadCollectCooldowns();

    const member =
      await guild.members
        .fetch(user.id)
        .catch(() => null);

    if (!member) {
      await sendReply({
        content:
          "❌ No pude verificar tus roles en este servidor.",
      });

      return;
    }

    const collectRoles =
      getCollectRolesForMember(
        member,
      );

    if (collectRoles.length === 0) {
      const embed =
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle(
            "🚫 Collect no disponible",
          )
          .setDescription(
            `<@${user.id}>, no tenés ningún rol con **Collect Income**.`,
          )
          .addFields({
            name:
              "🎟️ Roles con Collect",
            value: [
              `<@&${COLLECT_ROLES.CAMPEON.roleId}>`,
              `<@&${COLLECT_ROLES.MIEMBRO_DEL_MES.roleId}>`,
              `<@&${COLLECT_ROLES.MEJOR_MIEMBRO.roleId}>`,
              `<@&${COLLECT_ROLES.EXITOSO.roleId}>`,
            ].join("\n"),
            inline: false,
          })
          .setFooter({
            text:
              "Sistema de Collect • Luckybox",
          })
          .setTimestamp();

      await sendReply({
        embeds: [embed],
      });

      return;
    }

    const now = Date.now();

    const remaining =
      getRemainingCollectCooldown(
        guild.id,
        user.id,
        now,
      );

    if (remaining > 0) {
      const key =
        getCollectCooldownKey(
          guild.id,
          user.id,
        );

      const lastCollect =
        collectCooldownStore[key];

      const nextCollectTimestamp =
        Math.ceil(
          (
            lastCollect +
            COLLECT_COOLDOWN_MS
          ) / 1000,
        );

      const roleText =
        collectRoles
          .map(
            (role) =>
              `<@&${role.roleId}>`,
          )
          .join("\n");

      const cooldownEmbed =
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle(
            "⏳ Todavía no podés hacer otro collect",
          )
          .setDescription(
            `<@${user.id}>, ya hiciste tu **collect** recientemente.`,
          )
          .addFields(
            {
              name:
                "🕐 Tiempo restante",
              value:
                `\`\`\`\n${formatCollectRemaining(
                  remaining,
                )}\n\`\`\``,
              inline: true,
            },
            {
              name:
                "📅 Próximo collect",
              value:
                `<t:${nextCollectTimestamp}:R>\n<t:${nextCollectTimestamp}:F>`,
              inline: true,
            },
            {
              name:
                "🎖️ Roles detectados",
              value:
                roleText,
              inline: false,
            },
          )
          .setFooter({
            text:
              "El cooldown es de 6 días por servidor y usuario.",
          })
          .setTimestamp();

      await sendReply({
        embeds: [cooldownEmbed],
      });

      return;
    }

    const rewards =
      getCollectRewards(
        collectRoles,
      );

    if (rewards.length === 0) {
      await sendReply({
        content:
          "❌ Tus roles de Collect no tienen recompensas configuradas.",
      });

      return;
    }

    const deliveredRewards: Array<{
      itemId: string;
      quantity: number;
      cajaNombre: string;
      roleId: string;
      roleName: string;
    }> = [];

    try {
      for (const reward of rewards) {
        await addInventoryItem(
          guild.id,
          user.id,
          reward.itemId,
          reward.quantity,
        );

        deliveredRewards.push({
          ...reward,
        });
      }
    } catch (err) {
      logger.error(
        {
          err,
          guildId: guild.id,
          userId: user.id,
          collectRoles:
            collectRoles.map(
              (role) => ({
                roleId:
                  role.roleId,
                roleName:
                  role.roleName,
              }),
            ),
          deliveredRewards,
        },
        "Falló una entrega de -collect. Intentando revertir las recompensas ya entregadas.",
      );

      for (
        const delivered of deliveredRewards
      ) {
        try {
          await removeInventoryItem(
            guild.id,
            user.id,
            delivered.itemId,
            delivered.quantity,
          );
        } catch (rollbackError) {
          logger.error(
            {
              rollbackError,
              guildId:
                guild.id,
              userId:
                user.id,
              itemId:
                delivered.itemId,
              quantity:
                delivered.quantity,
            },
            "No se pudo revertir una recompensa parcial de -collect.",
          );
        }
      }

      throw err;
    }

    const collectTimestamp =
      Date.now();

    collectCooldownStore[
      getCollectCooldownKey(
        guild.id,
        user.id,
      )
    ] = collectTimestamp;

    await saveCollectCooldowns();

    logger.info(
      {
        guildId: guild.id,
        userId: user.id,
        collectRoles:
          collectRoles.map(
            (role) => ({
              roleId:
                role.roleId,
              roleName:
                role.roleName,
            }),
          ),
        rewards:
          deliveredRewards,
      },
      "Collect acumulativo ejecutado correctamente.",
    );

    const rewardCounts =
      new Map<string, number>();

    for (
      const reward of deliveredRewards
    ) {
      rewardCounts.set(
        reward.cajaNombre,
        (
          rewardCounts.get(
            reward.cajaNombre,
          ) ?? 0
        ) + reward.quantity,
      );
    }

    const rewardOrder = [
      "Mr Lucky Común",
      "Mr Lucky Raro",
      "Mr Lucky Épico",
      "MR LUCKY ADMIN",
    ];

    const rewardText =
      rewardOrder
        .filter(
          (caja) =>
            rewardCounts.has(caja),
        )
        .map(
          (caja) =>
            `• **${caja}** × \`${rewardCounts.get(
              caja,
            )}\``,
        )
        .join("\n");

    const rolesText =
      collectRoles
        .map(
          (role) =>
            `• <@&${role.roleId}>`,
        )
        .join("\n");

    const nextCollectTimestamp =
      Math.ceil(
        (
          collectTimestamp +
          COLLECT_COOLDOWN_MS
        ) / 1000,
      );

    const successEmbed =
      new EmbedBuilder()
        .setColor("Orange")
        .setTitle(
          "🎁 ¡Collect realizado con éxito!",
        )
        .setDescription(
          `<@${user.id}>, reclamaste correctamente tu Collect.`,
        )
        .addFields(
          {
            name:
              "🎖️ Roles detectados",
            value:
              rolesText,
            inline: false,
          },
          {
            name:
              "📦 Estado",
            value:
              "`ENTREGADO`",
            inline: true,
          },
          {
            name:
              "🎁 Recompensas obtenidas",
            value:
              rewardText ||
              "No se pudieron determinar las recompensas.",
            inline: false,
          },
          {
            name:
              "⏳ Próximo collect",
            value:
              `<t:${nextCollectTimestamp}:R>\n<t:${nextCollectTimestamp}:F>`,
            inline: false,
          },
        )
        .setFooter({
          text:
            "Sistema de Collect • Cooldown de 6 días",
        })
        .setTimestamp();

    await sendReply({
      embeds: [successEmbed],
    });
  } catch (err: any) {
    logger.error(
      {
        err,
        guildId: guild.id,
        userId: user.id,
      },
      "Error ejecutando collect.",
    );

    await sendReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle(
            "❌ No se pudo completar tu collect",
          )
          .setDescription(
            `<@${user.id}>, ocurrió un problema mientras intentaba entregarte las recompensas.`,
          )
          .addFields({
            name:
              "📋 Estado",
            value:
              "`NO COMPLETADO`",
            inline: false,
          })
          .setFooter({
            text:
              "No se consumió el cooldown porque el collect no terminó correctamente.",
          })
          .setTimestamp(),
      ],
    });
  }
}

/* ========================================================================== */
/*                         HANDLE INFO                                        */
/* ========================================================================== */

async function handleInfo(
  sendReply: ReplyFunction,
  cajaNombre: string,
): Promise<void> {
  const rewards =
    getRewardsArray(cajaNombre);

  const MONEDA_EMOJI =
    "<:MonedaServer:1524674026188967956>";

  const formatRewardText =
    (texto: string): string =>
      texto.replace(
        /Frijoles/gi,
        MONEDA_EMOJI,
      );

  const positivos =
    rewards
      .filter(
        (reward) =>
          reward.tipo === "positivo" ||
          reward.tipo.startsWith("rol"),
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
          reward.tipo === "negativo",
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
          name: "✨ Recompensas",
          value:
            positivos ||
            "No hay recompensas disponibles.",
          inline: false,
        },
        {
          name: "⚠️ Castigos",
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
    embeds: [infoEmbed],
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
        .fetch(moderatorUser.id)
        .catch(() => null);

    const hasAuthorizedRole =
      Boolean(member) &&
      member!.roles.cache.some(
        (role) =>
          AUTHORIZED_ROLES.includes(
            role.id,
          ),
      );

    if (!hasAuthorizedRole) {
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

    await addInventoryItem(
      guild.id,
      targetUser.id,
      itemId,
      1,
    );

    void sendLuckyboxLog(
      guild,
      moderatorUser,
      targetUser,
      cajaNombre,
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
      embeds: [embed],
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
    const guildId = guild.id;
    const userId = targetUser.id;

    const items =
      await getUserInventory(
        guildId,
        userId,
      );

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

    const reward =
      pickReward(cajaNombre);

    let rewardDescription =
      reward.texto;

    const rewardRoleId =
      ROLE_MAP[reward.tipo];

    const member =
      await guild.members
        .fetch(userId)
        .catch(() => null);

    if (
      rewardRoleId &&
      member
    ) {
      const role =
        await guild.roles
          .fetch(rewardRoleId)
          .catch(() => null);

      if (!role) {
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
          cash: reward.valor,
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
      embeds: [embed],
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
/*                         SLASH COMMAND /LUCKYBOX                            */
/* ========================================================================== */

export const data =
  new SlashCommandBuilder()
    .setName("luckybox")
    .setDescription(
      "Gestioná y abrí tus cajas Mr Lucky.",
    )

    /* ---------------------------------------------------------------------- */
    /* /luckybox collect                                                      */
    /* ---------------------------------------------------------------------- */

    .addSubcommand(
      (subcommand) =>
        subcommand
          .setName("collect")
          .setDescription(
            "Reclamá las Luckybox correspondientes a tus roles.",
          ),
    )

    /* ---------------------------------------------------------------------- */
    /* /luckybox drop                                                         */
    /* ---------------------------------------------------------------------- */

    .addSubcommand(
      (subcommand) =>
        subcommand
          .setName("drop")
          .setDescription(
            "Soltá una Luckybox para que alguien pueda reclamarla.",
          )
          .addStringOption(
            (option) =>
              option
                .setName("caja")
                .setDescription(
                  "Elegí el tipo de Luckybox que querés soltar.",
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
          )
          .addChannelOption(
            (option) =>
              option
                .setName("canal")
                .setDescription(
                  "Canal donde se soltará la Luckybox. Si no lo indicás, usa el canal actual.",
                )
                .addChannelTypes(
                  ChannelType.GuildText,
                )
                .setRequired(false),
          ),
    )

    /* ---------------------------------------------------------------------- */
    /* /luckybox abrir                                                        */
    /* ---------------------------------------------------------------------- */

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

    /* ---------------------------------------------------------------------- */
    /* /luckybox info                                                         */
    /* ---------------------------------------------------------------------- */

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

    /* ---------------------------------------------------------------------- */
    /* /luckybox dar                                                          */
    /* ---------------------------------------------------------------------- */

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
/*                         EXECUTE /LUCKYBOX                                  */
/* ========================================================================== */

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (interaction.client) {
    startAutoSync(interaction.client);
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

  /* ======================================================================== */
  /*                                COLLECT                                   */
  /* ======================================================================== */

  if (subcommand === "collect") {
    await interaction.deferReply({
      flags:
        MessageFlags.Ephemeral,
    });

    await handleCollect(
      interaction.guild,
      interaction.user,
      (options) =>
        interaction.editReply(
          options,
        ),
    );

    return;
  }

  /* ======================================================================== */
  /*                                DROP                                      */
  /* ======================================================================== */

  if (subcommand === "drop") {
    const cajaNombre =
      interaction.options.getString(
        "caja",
        true,
      );

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

    await handleLuckyboxDrop(
      (options) =>
        interaction.editReply(
          options,
        ),
      interaction.guild,
      interaction.user,
      cajaNombre,
      targetChannel,
    );

    return;
  }

  /*
   * `caja` solamente existe en abrir/info/dar,
   * por eso se obtiene después de comprobar collect/drop.
   */
  const cajaNombre =
    interaction.options.getString(
      "caja",
      true,
    );

  /* ======================================================================== */
  /*                                INFO                                      */
  /* ======================================================================== */

  if (subcommand === "info") {
    await interaction.deferReply({
      flags:
        MessageFlags.Ephemeral,
    });

    await handleInfo(
      (options) =>
        interaction.editReply(
          options,
        ),
      cajaNombre,
    );

    return;
  }

  /* ======================================================================== */
  /*                                 DAR                                      */
  /* ======================================================================== */

  if (subcommand === "dar") {
    const targetUser =
      interaction.options.getUser(
        "usuario",
        true,
      );

    await interaction.deferReply({
      flags:
        MessageFlags.Ephemeral,
    });

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

  /* ======================================================================== */
  /*                                ABRIR                                     */
  /* ======================================================================== */

  await interaction.deferReply({
    flags:
      MessageFlags.Ephemeral,
  });

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
      channel.send(options),
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

  if (message.client) {
    startAutoSync(message.client);
  }

  const mainArg =
    (args[0] ?? "").toLowerCase();

  /* ======================================================================== */
  /*                              -collect                                    */
  /* ======================================================================== */

  if (mainArg === "collect") {
    await handleCollect(
      message.guild,
      message.author,
      (options) =>
        message.reply(options),
    );

    return;
  }

  /* ======================================================================== */
  /*                         VALIDAR SUBCOMANDO                                */
  /* ======================================================================== */

  const validSubcommands =
    [
      "abrir",
      "info",
      "dar",
      "drop",
    ] as const;

  const isSubcommand =
    validSubcommands.includes(
      mainArg as
        | "abrir"
        | "info"
        | "dar"
        | "drop",
    );

  if (
    args.length === 0 ||
    !isSubcommand
  ) {
    await message.reply(
      "❌ Uso incorrecto. Tenés que usar `-luckybox abrir`, `-luckybox info`, `-luckybox dar` o `-luckybox drop`.",
    );

    return;
  }

  const sub =
    mainArg as
      | "abrir"
      | "info"
      | "dar"
      | "drop";

  const offset = 1;

  /* ======================================================================== */
  /*                         NORMALIZAR CAJAS                                 */
  /* ======================================================================== */

  const normalizeCaja =
    (value: string): string =>
      value
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(
          /[\u0300-\u036f]/g,
          "",
        );

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
        normalizeCaja(rawCaja);

      return (
        validCajas[normalized] ??
        null
      );
    };

  const opcionesValidas =
    "común, raro, épico y admin";

  /* ======================================================================== */
  /*                                  DROP                                    */
  /* ======================================================================== */

  if (sub === "drop") {
    const mentionedChannel =
      message.mentions.channels.first();

    const cajaArguments =
      args
        .slice(offset)
        .filter(
          (arg) =>
            !/^<#\d+>$/.test(
              arg,
            ),
        )
        .join(" ")
        .trim();

    if (!cajaArguments) {
      await message.reply(
        "❌ Uso correcto: `-luckybox drop [caja] [#canal opcional]`.",
      );

      return;
    }

    const cajaNombre =
      getCajaNombre(
        cajaArguments,
      );

    if (!cajaNombre) {
      await message.reply(
        `❌ Esa caja no existe. Las opciones válidas son: ${opcionesValidas}.`,
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

    await handleLuckyboxDrop(
      (options) =>
        message.reply(options),
      message.guild,
      message.author,
      cajaNombre,
      targetChannel,
    );

    return;
  }

  /* ======================================================================== */
  /*                                  DAR                                     */
  /* ======================================================================== */

  if (sub === "dar") {
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
        .slice(offset)
        .filter(
          (arg) =>
            !/^<@!?\d+>$/.test(
              arg,
            ),
        )
        .join(" ")
        .trim();

    if (!cajaNombreRestante) {
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
        message.reply(options),
      message.guild,
      message.author,
      mentionedUser,
      cajaNombre,
    );

    return;
  }

  /* ======================================================================== */
  /*                            ABRIR / INFO                                  */
  /* ======================================================================== */

  const cajaNombreRestante =
    args
      .slice(offset)
      .join(" ")
      .trim();

  if (!cajaNombreRestante) {
    await message.reply(
      `❌ Uso correcto: \`-luckybox ${sub} [caja]\`.\nLas cajas disponibles son: ${opcionesValidas}.`,
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

  if (sub === "info") {
    await handleInfo(
      (options) =>
        message.reply(options),
      cajaNombre,
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
      message.reply(options),
    (options) =>
      channel.send(options),
    message.guild,
    message.author,
    cajaNombre,
  );
}
