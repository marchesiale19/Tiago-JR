
import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Message,
  type User,
} from "discord.js";

import pkg from "unb-api";
const { Client: UnbClient } = pkg;

import { logger } from "../lib/logger";

/* ============================================================
 * CONFIGURACIÓN
 * ============================================================ */

const API_KEY = process.env.UNBELIEVABOAT_API_KEY;

const unb = new UnbClient(API_KEY ?? "");

const AUTHORIZED_ROLE_IDS = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1522434536796061816", // Desarrollador
  "1503876451315880016", // Administrador
  "1509760475653472287", // Administrador [PB]
  "1522807097920720967", // Manager
] as const;

type EconomyAction = "add" | "remove";
type BalancePlace = "cash" | "bank";

interface EconomyOptions {
  guildId: string;
  targetId: string;
  actorId: string;
  actorName: string;
  amount: number;
  place: BalancePlace;
  targetUser?: User;
}

interface EconomyReply {
  reply: (options: any) => Promise<any>;
  editReply?: (options: any) => Promise<any>;
}

const PLACE_LABELS: Record<BalancePlace, string> = {
  cash: "Efectivo",
  bank: "Banco",
};

/* ============================================================
 * PERMISOS
 * ============================================================ */

function hasEconomyPermission(member: GuildMember): boolean {
  return AUTHORIZED_ROLE_IDS.some((roleId) =>
    member.roles.cache.has(roleId),
  );
}

async function checkSlashPermission(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "❌ Este comando solo se puede usar en un servidor.",
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  const member = await interaction.guild.members
    .fetch(interaction.user.id)
    .catch(() => null);

  if (!member || !hasEconomyPermission(member)) {
    await interaction.reply({
      content: "❌ No tenés permiso para gestionar la economía.",
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  return true;
}

/* ============================================================
 * VALIDACIÓN
 * ============================================================ */

function validateAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(
      "La cantidad debe ser un número entero positivo.",
    );
  }
}

function validatePlace(place: string): asserts place is BalancePlace {
  if (place !== "cash" && place !== "bank") {
    throw new Error(
      'El lugar debe ser exactamente "cash" o "bank".',
    );
  }
}

function ensureApiKey(): void {
  if (!API_KEY) {
    throw new Error(
      "Falta configurar la variable UNBELIEVABOAT_API_KEY.",
    );
  }
}

/* ============================================================
 * OPERACIÓN DE ECONOMÍA
 * ============================================================ */

async function modifyBalance(
  action: EconomyAction,
  options: EconomyOptions,
): Promise<EmbedBuilder> {
  ensureApiKey();
  validateAmount(options.amount);
  validatePlace(options.place);

  const signedAmount =
    action === "add" ? options.amount : -options.amount;

  await unb.editUserBalance(
    options.guildId,
    options.targetId,
    {
      [options.place]: signedAmount,
    },
  );

  const isAdd = action === "add";
  const target = options.targetUser
    ? `${options.targetUser} (${options.targetUser.username})`
    : `<@${options.targetId}>`;

  return new EmbedBuilder()
    .setColor(isAdd ? 0x2ecc71 : 0xe74c3c)
    .setTitle(
      isAdd
        ? "💰 Dinero añadido correctamente"
        : "💸 Dinero retirado correctamente",
    )
    .setDescription(
      isAdd
        ? `Se añadieron **${options.amount.toLocaleString("es-ES")} frijoles** al saldo de ${target}.`
        : `Se retiraron **${options.amount.toLocaleString("es-ES")} frijoles** del saldo de ${target}.`,
    )
    .addFields(
      {
        name: "👮 Responsable",
        value: `<@${options.actorId}>`,
        inline: true,
      },
      {
        name: "👤 Usuario afectado",
        value: `<@${options.targetId}>`,
        inline: true,
      },
      {
        name: "💵 Cantidad",
        value: `**${options.amount.toLocaleString("es-ES")} frijoles**`,
        inline: true,
      },
      {
        name: "🏦 Lugar",
        value: PLACE_LABELS[options.place],
        inline: true,
      },
      {
        name: "🧾 Tipo de saldo",
        value: `\`${options.place}\``,
        inline: true,
      },
    )
    .setFooter({
      text: "Gestión de economía • UnbelievaBoat",
    })
    .setTimestamp();
}

/* ============================================================
 * EJECUCIÓN COMPARTIDA
 * ============================================================ */

async function executeEconomyAction(
  action: EconomyAction,
  options: EconomyOptions,
  reply: EconomyReply,
): Promise<void> {
  try {
    const embed = await modifyBalance(action, options);

    if (reply.editReply) {
      await reply.editReply({
        embeds: [embed],
      });
    } else {
      await reply.reply({
        embeds: [embed],
        allowedMentions: { users: [options.targetId] },
      });
    }

    logger.info(
      {
        action,
        guildId: options.guildId,
        actorId: options.actorId,
        targetId: options.targetId,
        amount: options.amount,
        place: options.place,
      },
      "Economy balance modified",
    );
  } catch (err) {
    logger.error(
      {
        err,
        action,
        guildId: options.guildId,
        actorId: options.actorId,
        targetId: options.targetId,
        amount: options.amount,
        place: options.place,
      },
      "Error modifying UnbelievaBoat balance",
    );

    const errorMessage =
      err instanceof Error
        ? err.message
        : "Error desconocido al modificar el saldo.";

    const response = {
      content: `❌ No se pudo modificar el saldo: ${errorMessage}`,
      embeds: [],
    };

    if (reply.editReply) {
      await reply.editReply(response).catch(() => {});
    } else {
      await reply.reply(response).catch(() => {});
    }
  }
}

/* ============================================================
 * COMANDO FACTORY
 * ============================================================ */

function createEconomyCommand(action: EconomyAction) {
  const isAdd = action === "add";
  const commandName = isAdd ? "darplata" : "quitarplata";

  const data = new SlashCommandBuilder()
    .setName(commandName)
    .setDescription(
      isAdd
        ? "Añade dinero al saldo de un usuario."
        : "Retira dinero del saldo de un usuario.",
    )
    .addUserOption((option) =>
      option
        .setName("usuario")
        .setDescription("Usuario que recibirá o perderá el dinero.")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("cantidad")
        .setDescription("Cantidad de frijoles.")
        .setMinValue(1)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("lugar")
        .setDescription("Saldo que se modificará.")
        .addChoices(
          { name: "Cash (efectivo)", value: "cash" },
          { name: "Bank (banco)", value: "bank" },
        )
        .setRequired(true),
    );

  return {
    data,

    async execute(
      interaction: ChatInputCommandInteraction,
    ): Promise<void> {
      if (!(await checkSlashPermission(interaction))) {
        return;
      }

      const target = interaction.options.getUser("usuario", true);
      const amount = interaction.options.getInteger("cantidad", true);
      const place = interaction.options.getString("lugar", true);

      if (target.bot) {
        await interaction.reply({
          content: "❌ No podés gestionar la economía de un bot.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      try {
        validateAmount(amount);
        validatePlace(place);
      } catch (err) {
        await interaction.reply({
          content:
            err instanceof Error
              ? `❌ ${err.message}`
              : "❌ Los argumentos no son válidos.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply();

      await executeEconomyAction(
        action,
        {
          guildId: interaction.guildId!,
          targetId: target.id,
          targetUser: target,
          actorId: interaction.user.id,
          actorName: interaction.user.username,
          amount,
          place,
        },
        {
          reply: (options) => interaction.reply(options),
          editReply: (options) => interaction.editReply(options),
        },
      );
    },

    async run(
      message: Message,
      args: string[],
    ): Promise<void> {
      if (!message.guild || !message.guildId || !message.member) {
        await message.reply(
          "❌ Este comando solo se puede usar en un servidor.",
        );
        return;
      }

      if (!hasEconomyPermission(message.member)) {
        await message.reply(
          "❌ No tenés permiso para gestionar la economía.",
        );
        return;
      }

      // Uso: -darplata @usuario 5000 cash
      // Uso: -quitarplata ID_USUARIO 5000 bank
      const targetToken = args[0];
      const amountToken = args[1];
      const placeToken = args[2]?.toLowerCase();

      if (!targetToken || !amountToken || !placeToken) {
        await message.reply({
          content:
            `❌ Uso correcto: \`-${commandName} @usuario <cantidad> <cash|bank>\``,
        });
        return;
      }

      const mentionMatch = targetToken.match(/^<@!?(\d+)>$/);
      const targetId = mentionMatch?.[1] ??
        (/^\d{15,22}$/.test(targetToken) ? targetToken : null);

      if (!targetId) {
        await message.reply(
          "❌ Debés indicar una mención o un ID de usuario válido.",
        );
        return;
      }

      if (!/^\d+$/.test(amountToken)) {
        await message.reply(
          "❌ La cantidad debe ser un número entero positivo.",
        );
        return;
      }

      const amount = Number(amountToken);

      try {
        validateAmount(amount);
        validatePlace(placeToken);
      } catch (err) {
        await message.reply(
          `❌ ${err instanceof Error ? err.message : "Argumentos inválidos."}`,
        );
        return;
      }

      if (targetId === message.author.id && !isAdd) {
        // Se permite retirar dinero al propio usuario si el staff lo autoriza.
        // No se aplica ninguna excepción de permisos.
      }

      const targetUser = await message.client.users
        .fetch(targetId)
        .catch(() => null);

      if (targetUser?.bot) {
        await message.reply(
          "❌ No podés gestionar la economía de un bot.",
        );
        return;
      }

      await executeEconomyAction(
        action,
        {
          guildId: message.guildId,
          targetId,
          targetUser: targetUser ?? undefined,
          actorId: message.author.id,
          actorName: message.author.username,
          amount,
          place: placeToken,
        },
        {
          reply: (options) => message.reply(options),
        },
      );
    },
  };
}

/* ============================================================
 * EXPORTACIONES
 * ============================================================ */

export const darplata = createEconomyCommand("add");
export const quitarplata = createEconomyCommand("remove");
