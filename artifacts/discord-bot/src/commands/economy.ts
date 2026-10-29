
import {
  EmbedBuilder,
  Message,
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  User,
} from "discord.js";

import { unb } from "../lib/unb";
import { logger } from "../utils/logger";

// ─────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────

const PREFIX = "-";

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

type EconomyAction = "darplata" | "quitarplata";
type EconomyLocation = "cash" | "bank";

interface EconomyInput {
  action: EconomyAction;
  guildId: string;
  moderator: User;
  member: GuildMember;
  target: User;
  amount: number;
  location: EconomyLocation;
}

type EconomyResult =
  | { success: true; embed: EmbedBuilder }
  | { success: false; error: string };

// ─────────────────────────────────────────────
// Validaciones
// ─────────────────────────────────────────────

function hasEconomyPermission(member: GuildMember): boolean {
  return AUTHORIZED_ROLE_IDS.some((roleId) =>
    member.roles.cache.has(roleId),
  );
}

function isValidAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount > 0;
}

function isValidLocation(
  location: string,
): location is EconomyLocation {
  return location === "cash" || location === "bank";
}

function createUsageMessage(action: EconomyAction): string {
  return (
    `❌ Uso correcto: \`${PREFIX}${action} <@usuario|ID> <cantidad> <cash|bank>\`\n` +
    `Ejemplo: \`${PREFIX}${action} @Usuario 500 cash\``
  );
}

// ─────────────────────────────────────────────
// Embed de confirmación
// ─────────────────────────────────────────────

function createEconomyEmbed(
  input: EconomyInput,
): EmbedBuilder {
  const isAddition = input.action === "darplata";

  return new EmbedBuilder()
    .setColor(isAddition ? 0x2ecc71 : 0xe74c3c)
    .setTitle(
      isAddition
        ? "💵 Dinero añadido correctamente"
        : "💸 Dinero retirado correctamente",
    )
    .setDescription(
      isAddition
        ? "Se ha añadido dinero a la cuenta del usuario."
        : "Se ha descontado dinero de la cuenta del usuario.",
    )
    .addFields(
      {
        name: "Responsable",
        value: `${input.moderator} (\`${input.moderator.id}\`)`,
        inline: false,
      },
      {
        name: "Usuario objetivo",
        value: `${input.target} (\`${input.target.id}\`)`,
        inline: false,
      },
      {
        name: "Cantidad",
        value: `\`${input.amount.toLocaleString("es-ES")}\``,
        inline: true,
      },
      {
        name: "Cuenta",
        value:
          input.location === "cash"
            ? "💵 Cash / Efectivo"
            : "🏦 Bank / Banco",
        inline: true,
      },
      {
        name: "Operación",
        value: isAddition ? "Adición (+)" : "Retirada (-)",
        inline: true,
      },
    )
    .setFooter({
      text: `Economía • ${input.action}`,
    })
    .setTimestamp();
}

// ─────────────────────────────────────────────
// Lógica común: permisos, validación y UnbelievaBoat
// ─────────────────────────────────────────────

async function executeEconomy(
  input: EconomyInput,
): Promise<EconomyResult> {
  if (!hasEconomyPermission(input.member)) {
    return {
      success: false,
      error: "⛔ No tienes un rol autorizado para gestionar la economía.",
    };
  }

  if (!isValidAmount(input.amount)) {
    return {
      success: false,
      error: "❌ La cantidad debe ser un número entero positivo.",
    };
  }

  if (!isValidLocation(input.location)) {
    return {
      success: false,
      error: "❌ El lugar debe ser `cash` o `bank`.",
    };
  }

  const amount =
    input.action === "darplata"
      ? input.amount
      : -input.amount;

  try {
    await unb.editUserBalance(
      input.guildId,
      input.target.id,
      input.location === "cash"
        ? { cash: amount }
        : { bank: amount },
    );

    logger.info(
      `[ECONOMY] ${input.action}: moderator=${input.moderator.id}, ` +
      `target=${input.target.id}, amount=${amount}, ` +
      `location=${input.location}, guild=${input.guildId}`,
    );

    return {
      success: true,
      embed: createEconomyEmbed(input),
    };
  } catch (error) {
    logger.error(
      `[ECONOMY] Error en ${input.action}: ${String(error)}`,
    );

    return {
      success: false,
      error:
        "❌ No se pudo actualizar el saldo. Comprueba la configuración de UnbelievaBoat e inténtalo de nuevo.",
    };
  }
}

// ─────────────────────────────────────────────
// Definiciones de Slash Commands
// ─────────────────────────────────────────────

export const economySlashCommands = [
  new SlashCommandBuilder()
    .setName("darplata")
    .setDescription("Añade dinero al balance de un usuario.")
    .addUserOption((option) =>
      option
        .setName("usuario")
        .setDescription("Usuario que recibirá el dinero.")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("cantidad")
        .setDescription("Cantidad de dinero que se añadirá.")
        .setMinValue(1)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("lugar")
        .setDescription("Cuenta que recibirá el dinero.")
        .addChoices(
          { name: "Cash", value: "cash" },
          { name: "Bank", value: "bank" },
        )
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("quitarplata")
    .setDescription("Retira dinero del balance de un usuario.")
    .addUserOption((option) =>
      option
        .setName("usuario")
        .setDescription("Usuario al que se le retirará el dinero.")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("cantidad")
        .setDescription("Cantidad de dinero que se retirará.")
        .setMinValue(1)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("lugar")
        .setDescription("Cuenta de la que se retirará el dinero.")
        .addChoices(
          { name: "Cash", value: "cash" },
          { name: "Bank", value: "bank" },
        )
        .setRequired(true),
    ),
].map((command) => command.toJSON());

// ─────────────────────────────────────────────
// Handler Slash Commands
// ─────────────────────────────────────────────

export async function handleEconomySlash(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const commandName = interaction.commandName;

  if (
    commandName !== "darplata" &&
    commandName !== "quitarplata"
  ) {
    return;
  }

  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: "❌ Este comando solo puede utilizarse en un servidor.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = interaction.guild;

  if (!guild) {
    await interaction.reply({
      content: "❌ No se pudo obtener el servidor.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let member: GuildMember;

  try {
    member = await guild.members.fetch(interaction.user.id);
  } catch (error) {
    logger.error(`[ECONOMY] No se pudo obtener el miembro: ${String(error)}`);

    await interaction.reply({
      content: "❌ No se pudieron verificar tus roles.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Comprobar permisos ANTES de diferir la interacción.
  if (!hasEconomyPermission(member)) {
    await interaction.reply({
      content: "⛔ No tienes permisos para utilizar este comando.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const target = interaction.options.getUser("usuario", true);
  const amount = interaction.options.getInteger("cantidad", true);
  const location = interaction.options.getString("lugar", true);

  if (!isValidAmount(amount) || !isValidLocation(location)) {
    await interaction.reply({
      content: "❌ La cantidad o el lugar indicado no son válidos.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  const result = await executeEconomy({
    action: commandName,
    guildId: interaction.guildId,
    moderator: interaction.user,
    member,
    target,
    amount,
    location,
  });

  if (!result.success) {
    await interaction.editReply({
      content: result.error,
    });
    return;
  }

  await interaction.editReply({
    embeds: [result.embed],
  });
}

// ─────────────────────────────────────────────
// Handler de comandos con prefijo
// ─────────────────────────────────────────────

export async function handleEconomyPrefix(
  message: Message,
): Promise<boolean> {
  if (!message.guild || message.author.bot) {
    return false;
  }

  const args = message.content.trim().split(/\s+/);
  const commandName = args[0]?.toLowerCase();

  if (
    commandName !== "-darplata" &&
    commandName !== "-quitarplata"
  ) {
    return false;
  }

  const action = commandName.slice(1) as EconomyAction;

  // Rechazar argumentos ausentes o adicionales.
  if (args.length !== 4) {
    await message.reply(createUsageMessage(action));
    return true;
  }

  const [, rawTarget, rawAmount, rawLocation] = args;

  // Admite @mención, <@ID>, <@!ID> o ID numérico.
  const mentionMatch = rawTarget.match(/^<@!?(\d+)>$/);
  const targetId = mentionMatch?.[1] ??
    (/^\d{17,20}$/.test(rawTarget) ? rawTarget : null);

  if (!targetId) {
    await message.reply(
      "❌ Debes indicar una mención válida o el ID del usuario.\n" +
      createUsageMessage(action),
    );
    return true;
  }

  // Solo enteros positivos escritos en formato decimal.
  if (!/^\d+$/.test(rawAmount)) {
    await message.reply(
      "❌ La cantidad debe ser un número entero positivo.",
    );
    return true;
  }

  const amount = Number(rawAmount);
  const location = rawLocation.toLowerCase();

  if (!isValidAmount(amount)) {
    await message.reply(
      "❌ La cantidad debe ser mayor que cero y un entero seguro.",
    );
    return true;
  }

  if (!isValidLocation(location)) {
    await message.reply(
      "❌ El lugar debe ser `cash` o `bank`.",
    );
    return true;
  }

  // Verificar los permisos antes de llamar a UnbelievaBoat.
  const member = message.member;

  if (!member || !hasEconomyPermission(member)) {
    // Los mensajes de prefijo no admiten respuestas efímeras nativas.
    await message.reply(
      "⛔ No tienes permisos para utilizar este comando.",
    );
    return true;
  }

  let target: User;

  try {
    target = await message.client.users.fetch(targetId);
  } catch (error) {
    logger.error(`[ECONOMY] No se encontró el usuario: ${String(error)}`);

    await message.reply("❌ No se pudo encontrar ese usuario.");
    return true;
  }

  const result = await executeEconomy({
    action,
    guildId: message.guild.id,
    moderator: message.author,
    member,
    target,
    amount,
    location,
  });

  if (!result.success) {
    await message.reply(result.error);
    return true;
  }

  await message.reply({
    embeds: [result.embed],
    allowedMentions: { repliedUser: false },
  });

  return true;
}
