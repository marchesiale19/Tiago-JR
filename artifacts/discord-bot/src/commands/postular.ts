
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Message,
  type TextChannel,
} from "discord.js";

import {
  ApplicationsClosedError,
  areApplicationsOpen,
  createApplicationsClosedWaiter,
} from "../lib/applications-state";

import { logger } from "../lib/logger";

// ============================================================
// CONFIGURACIÓN
// ============================================================

export const data = new SlashCommandBuilder()
  .setName("postular")
  .setDescription(
    "Inicia el proceso de postulación al rol de Trial Helper por mensaje directo (DM).",
  );

(data as any).category = "Postulaciones";

const ADMIN_CHANNEL_ID = "1553260721377382430";
const ROL_POSTULADOS_ID = "1509745451224797274";

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

// Roles autorizados para aceptar o rechazar postulaciones.
const ROLES_ADMIN_POSTULACIONES = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1455419124732657801", // Equipo Administrativo
  "1522434536796061816", // Desarrollador
  "1453211902267228160", // Administrador
  "1509760475653472287", // Administrador [PB]
];

// Roles inmunes al cooldown de postulaciones.
// Quienes tengan al menos uno de estos roles no deberán esperar 7 días.
// Esta inmunidad solo omite el cooldown, no las demás restricciones.
const COOLDOWN_IMMUNE_ROLES = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
  "1455419124732657801", // Equipo Administrativo
  "1522434536796061816", // Desarrollador
  "1453211902267228160", // Administrador
  "1509760475653472287", // Administrador [PB]
];

const QUESTIONS = [
  "Nombre:",
  "Edad:",
  "¿Tienes experiencia de staff?",
  "¿Con quién te sueles llevar en el server?",
  "¿Qué aportarías como STAFF?",
  "¿Qué tan activo eres a la semana?",
];

// Mapeo de roles de niveles por ID, ordenados del mayor al menor.
// Se prioriza el rango más alto que tenga el usuario.
const NIVELES_ROLES_MAP: {
  id: string;
  name: string;
  level: number;
}[] = [
  { id: "1455623555604545546", name: "Veterano lvl 100", level: 100 },
  { id: "1455623521001668918", name: "Super OG", level: 90 },
  { id: "1455623485324918814", name: "OG", level: 80 },
  { id: "1455623454203318375", name: "Secret", level: 70 },
  {
    id: "1455623420585971867",
    name: "Super Hiper Fan de Bax",
    level: 60,
  },
  { id: "1455623315749343262", name: "Mega Fans de Bax", level: 30 },
  { id: "1455623274603217089", name: "Super Fans de Bax", level: 20 },
  { id: "1455623127060189408", name: "Fan de Bax", level: 10 },
  { id: "1455623159553196032", name: "Super Miembro", level: 5 },
  { id: "1455610985829236877", name: "Miembro", level: 0 },
];

// ============================================================
// ESTADO DEL COOLDOWN
// ============================================================

// Cooldown temporal en memoria.
// Se reinicia cuando se reinicia el bot.
const lastUsedAt = new Map<string, number>();

// ============================================================
// UTILIDADES
// ============================================================

function formatRemainingCooldown(msRemaining: number): string {
  const totalSeconds = Math.ceil(msRemaining / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

// ============================================================
// COMANDO PRINCIPAL: /postular
// ============================================================

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const user = interaction.user;

  await interaction.deferReply({ ephemeral: true });

  // El comando solo funciona dentro de un servidor.
  if (!interaction.guild) {
    await interaction.editReply({
      content: "Este comando solo se puede usar dentro de un servidor.",
    });
    return;
  }

  // Comprobar si las postulaciones están abiertas.
  if (!areApplicationsOpen()) {
    await interaction.editReply({
      content:
        "❌ Las postulaciones para Trial Helper están actualmente cerradas. Por favor, espera a que el staff las abra nuevamente.",
    });
    return;
  }

  // Obtener los roles del miembro.
  const member = interaction.member;
  const memberRolesCache = (member?.roles as any)?.cache;

  // ==========================================================
  // COMPROBACIÓN DEL COOLDOWN
  // ==========================================================

  const now = Date.now();
  const cooldownKey = `${interaction.guildId}-${user.id}`;

  // La inmunidad se comprueba por ID de rol, no por ID de usuario.
  const isCooldownImmune = COOLDOWN_IMMUNE_ROLES.some((roleId) =>
    memberRolesCache?.has(roleId),
  );

  // Los miembros inmunes omiten exclusivamente la comprobación
  // del cooldown de siete días.
  if (!isCooldownImmune) {
    const lastUsed = lastUsedAt.get(cooldownKey);

    if (lastUsed !== undefined) {
      const elapsed = now - lastUsed;

      if (elapsed < COOLDOWN_MS) {
        await interaction.editReply({
          content: `Debes esperar ${formatRemainingCooldown(
            COOLDOWN_MS - elapsed,
          )} antes de volver a postularte.`,
        });
        return;
      }
    }
  }

  // ==========================================================
  // OBTENER EL CANAL DE POSTULACIONES
  // ==========================================================

  let adminChannel: TextChannel | null = null;

  try {
    const fetchedChannel =
      await interaction.guild.channels.fetch(ADMIN_CHANNEL_ID);

    if (fetchedChannel && fetchedChannel.isTextBased()) {
      adminChannel = fetchedChannel as TextChannel;
    }
  } catch (err) {
    console.error(
      "[postular] ERROR searching admin channel:",
      err,
    );
  }

  // ==========================================================
  // COMPROBAR POSTULACIONES PENDIENTES
  // ==========================================================

  if (adminChannel) {
    try {
      const messages = await adminChannel.messages.fetch({
        limit: 100,
      });

      const existingApplication = messages.find(
        (msg) =>
          msg.author.id === interaction.client.user.id &&
          msg.embeds.length > 0 &&
          msg.embeds[0].description?.includes(`<@${user.id}>`) &&
          !msg.embeds[0].title?.includes("APROBADA") &&
          !msg.embeds[0].title?.includes("RECHAZADA"),
      );

      if (existingApplication) {
        await interaction.editReply({
          content:
            "❌ Ya tienes una postulación en revisión. Espera a que el staff tome una decisión.",
        });
        return;
      }
    } catch (err) {
      console.error(
        "[postular] Error al buscar duplicados:",
        err,
      );
    }
  }

  // ==========================================================
  // COMPROBAR EL ROL POSTULADOS POR ID
  // ==========================================================

  // Si el miembro tiene este ID de rol, no puede postularse.
  // El nombre del rol ya no importa.
  const tieneRolPostulado = memberRolesCache?.has(
    ROL_POSTULADOS_ID,
  ) ?? false;

  if (tieneRolPostulado) {
    await interaction.editReply({
      content:
        "❌ Ya tienes el rol de **Postulados**, por lo que no puedes iniciar otra postulación. Por favor, contacta al staff si crees que esto es un error.",
    });
    return;
  }

  // ==========================================================
  // ENVIAR LA INTRODUCCIÓN POR MENSAJE DIRECTO
  // ==========================================================

  let dmChannel;

  try {
    dmChannel = await user.createDM();

    const introEmbed = new EmbedBuilder()
      .setTitle("📩 POSTULACIÓN TRIAL HELPER")
      .setColor("Orange")
      .setImage(
        "https://i.postimg.cc/BbwL7Ywv/240-sin-titulo-20260614011117.webp",
      )
      .setDescription(
        `¡Hola **${user.username}**! Vamos a comenzar tu postulación para el rol de **Trial Helper**.\n\n` +
          `**¿Qué es un Trial Helper?**\n` +
          `Es un periodo de \`Prueba\` donde te encargarás de moderar constantemente el servidor, asegurando que todos los usuarios cumplan las reglas en VC y chats.\n\n` +
          `**Funciones:**\n` +
          `• +Mute / +Unmute\n` +
          `• Ensordecer y quitar ensordecimiento\n` +
          `• Mover a usuarios\n` +
          `• Responder tickets\n\n` +
          `🕓 Tienes tiempo para responder hasta que el STAFF oficialmente cierre las postulaciones.\n` +
          `Si en cualquier momento quieres cancelar tu postulación, escribe "cancelar".`,
      )
      .setFooter({ text: "¡Mucha suerte!" });

    await dmChannel.send({
      embeds: [introEmbed],
    });
  } catch (err) {
    lastUsedAt.delete(cooldownKey);

    logger.warn(
      { err, userId: user.id },
      "Could not open DM with user",
    );

    await interaction.editReply({
      content:
        "No pude enviarte un mensaje directo. Revisa tu configuración de privacidad y permite mensajes directos de miembros del servidor.",
    });
    return;
  }

  // Registrar el inicio del cooldown.
  // Los miembros inmunes también pueden tener registro,
  // pero ese registro nunca los bloqueará.
  lastUsedAt.set(cooldownKey, now);

  await interaction.editReply({
    content:
      "Te envié un mensaje directo para continuar con tu postulación.",
  });

  // ==========================================================
  // CUESTIONARIO POR MENSAJE DIRECTO
  // ==========================================================

  const answers: string[] = [];

  for (const question of QUESTIONS) {
    // Cancelar la postulación si el staff cierra las postulaciones.
    if (!areApplicationsOpen()) {
      lastUsedAt.delete(cooldownKey);

      await dmChannel.send(
        "🔒 Las postulaciones fueron cerradas por el staff. Tu postulación fue cancelada. Podrás intentarlo nuevamente cuando el staff las abra.",
      );
      return;
    }

    await dmChannel.send(question);

    const {
      promise: closedPromise,
      cancel: cancelClosedWaiter,
    } = createApplicationsClosedWaiter();

    try {
      const collected = await Promise.race([
        dmChannel.awaitMessages({
          filter: (msg: Message) => msg.author.id === user.id,
          max: 1,
        }),
        closedPromise,
      ]);

      const answer = collected.first()?.content ?? "";

      // Si la persona escribe "cancelar", finaliza el proceso.
      // El cooldown se mantiene.
      if (answer.trim().toLowerCase() === "cancelar") {
        await dmChannel.send(
          "La postulación ha sido cancelada correctamente. Podrás volver a postularte cuando termine tu tiempo de espera.",
        );
        return;
      }

      answers.push(answer);
    } catch (err) {
      if (err instanceof ApplicationsClosedError) {
        lastUsedAt.delete(cooldownKey);

        await dmChannel.send(
          "🔒 Las postulaciones fueron cerradas por el staff mientras respondías. Tu postulación fue cancelada.",
        );
        return;
      }

      await dmChannel.send(
        "⚠️ Hubo un problema inesperado durante tu postulación. Tu postulación fue cancelada.",
      );
      return;
    } finally {
      cancelClosedWaiter();
    }
  }

  // ==========================================================
  // COMPROBAR EL CANAL ANTES DE ENVIAR LA POSTULACIÓN
  // ==========================================================

  if (!adminChannel) {
    try {
      await dmChannel.send(
        "⚠️ Hubo un problema al enviar tu postulación al staff. Por favor contacta a un administrador.",
      );
    } catch (err) {
      // No hacer nada si tampoco se puede enviar el mensaje directo.
    }

    return;
  }

  // ==========================================================
  // DETECTAR EL NIVEL DEL MIEMBRO
  // ==========================================================

  let nivelRoleMention = "Miembro";

  for (const item of NIVELES_ROLES_MAP) {
    if (memberRolesCache?.has(item.id)) {
      nivelRoleMention = `<@&${item.id}>`;
      break;
    }
  }

  // ==========================================================
  // CONSTRUIR EL EMBED DE POSTULACIÓN
  // ==========================================================

  const embed = new EmbedBuilder()
    .setTitle("📩 Nueva Postulación - Staff")
    .setColor("Orange")
    .setThumbnail(user.displayAvatarURL())
    .setDescription(
      `Postulación de <@${user.id}> (${user.username})`,
    )
    .addFields(
      {
        name: "📅 Fecha de ingreso:",
        value: (interaction.member as any)?.joinedAt
          ? `<t:${Math.floor(
              (interaction.member as any).joinedAt.getTime() / 1000,
            )}:D>`
          : "Desconocido",
      },
      {
        name: "⭐ Nivel:",
        value: nivelRoleMention,
        inline: true,
      },
      ...QUESTIONS.map((question, index) => ({
        name: question,
        value: answers[index] || "N/A",
      })),
    )
    .setFooter({
      text: "Pendiente de revisión por staff",
    })
    .setTimestamp()
    .setImage(
      "https://i.postimg.cc/s2n6Fjpt/file-000000004804720e90052ae92e4297c3.png",
    );

  // ==========================================================
  // BOTONES PARA ACEPTAR O RECHAZAR
  // ==========================================================

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`postular_approve_${user.id}`)
      .setLabel("Aceptar")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`postular_reject_${user.id}`)
      .setLabel("Rechazar")
      .setStyle(ButtonStyle.Danger),
  );

  // ==========================================================
  // ENVIAR LA POSTULACIÓN AL STAFF
  // ==========================================================

  try {
    await adminChannel.send({
      embeds: [embed],
      components: [row],
    });

    await dmChannel.send(
      "✅ Tu postulación fue enviada al staff.",
    );

    await interaction.editReply({
      content:
        "✅ Tu postulación ha sido enviada correctamente al staff. Revisa tus mensajes directos.",
    });
  } catch (err) {
    await interaction.editReply({
      content:
        "⚠️ Tu postulación fue enviada al staff, pero hubo un detalle con los mensajes directos.",
    });
  }
}

// ============================================================
// VALIDACIÓN DE BOTONES: ACEPTAR / RECHAZAR
// ============================================================

export async function handleButton(
  interaction: any,
): Promise<void> {
  if (!interaction.isButton()) return;

  if (
    !interaction.customId.startsWith("postular_approve_") &&
    !interaction.customId.startsWith("postular_reject_")
  ) {
    return;
  }

  const member = interaction.member;

  if (!member || !member.roles) {
    await interaction.reply({
      content: "❌ No se pudieron verificar tus roles.",
      ephemeral: true,
    });
    return;
  }

  const memberRolesCache = member.roles.cache;

  const hasPermission = ROLES_ADMIN_POSTULACIONES.some(
    (roleId) => memberRolesCache.has(roleId),
  );

  if (!hasPermission) {
    await interaction.reply({
      content:
        "❌ No tienes los permisos necesarios para aceptar o rechazar esta postulación.",
      ephemeral: true,
    });
    return;
  }
}
