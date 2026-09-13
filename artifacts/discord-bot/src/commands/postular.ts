import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Message,
  type OverwriteResolvable,
  type TextChannel,
} from "discord.js";
import {
  ApplicationsClosedError,
  areApplicationsOpen,
  createApplicationsClosedWaiter,
} from "../lib/applications-state";
import { logger } from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("postular")
  .setDescription(
    "Inicia el proceso de postulación al rol de Trial Helper por mensaje directo (DM).",
  );
(data as any).category = "Postulaciones";

const STAFF_ROLE_ID = process.env["STAFF_ROLE_ID"];

const QUESTIONS = [
  "Nombre:",
  "Edad:",
  "¿Tienes experiencia de staff?",
  "¿Con quién te sueles llevar en el server?",
  "¿Qué aportarías como STAFF?",
  "¿Qué tan activo eres a la semana?",
];

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const APPLICATIONS_CHANNEL_NAME = "postulaciones-staff";

// Mapeo de roles de niveles por ID, ordenados del mayor al menor para priorizar el rango más alto
const NIVELES_ROLES_MAP: { id: string; name: string; level: number }[] = [
  { id: "1455623555604545546", name: "Veterano lvl 100", level: 100 },
  { id: "1455623521001668918", name: "Super OG", level: 90 },
  { id: "1455623485324918814", name: "OG", level: 80 },
  { id: "1455623454203318375", name: "Secret", level: 70 },
  { id: "1455623420585971867", name: "Super Hiper Fan de Bax", level: 60 },
  { id: "1455623315749343262", name: "Mega Fans de Bax", level: 30 },
  { id: "1455623274603217089", name: "Super Fans de Bax", level: 20 },
  { id: "1455623127060189408", name: "Fan de Bax", level: 10 },
  { id: "1455623159553196032", name: "Super Miembro", level: 5 },
  { id: "1455610985829236877", name: "Miembro", level: 0 },
];

const lastUsedAt = new Map<string, number>();

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

async function getOrCreateApplicationsChannel(
  interaction: ChatInputCommandInteraction,
): Promise<TextChannel | null> {
  const guild = interaction.guild;
  if (!guild) return null;

  const botUserId = interaction.client.user.id;

  let existing;
  try {
    await guild.channels.fetch();
    existing = guild.channels.cache.find(
      (channel) =>
        channel.name === APPLICATIONS_CHANNEL_NAME &&
        channel.type === ChannelType.GuildText,
    );
  } catch (err) {
    console.error(`[postular] ERROR searching channels:`, err);
    return null;
  }

  if (existing) {
    const existingChannel = existing as TextChannel;
    try {
      await applyApplicationsChannelPermissions(
        existingChannel,
        guild.id,
        botUserId,
      );
    } catch (err) {
      logger.warn({ err, channelId: existingChannel.id }, "Failed to update permissions");
    }
    return existingChannel;
  }

  try {
    const created = await guild.channels.create({
      name: APPLICATIONS_CHANNEL_NAME,
      type: ChannelType.GuildText,
      reason: "Canal privado para revisar postulaciones de staff",
      permissionOverwrites: buildApplicationsChannelOverwrites(
        guild.id,
        botUserId,
      ),
    });
    return created;
  } catch (err) {
    logger.warn({ err, guildId: guild.id }, "Failed to create applications channel");
    return null;
  }
}

function buildApplicationsChannelOverwrites(
  guildId: string,
  botUserId: string,
): OverwriteResolvable[] {
  const overwrites: OverwriteResolvable[] = [
    {
      id: guildId,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: botUserId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageRoles,
      ],
    },
  ];

  if (STAFF_ROLE_ID) {
    overwrites.push({
      id: STAFF_ROLE_ID,
      allow: [PermissionFlagsBits.ViewChannel],
    });
  }

  return overwrites;
}

async function applyApplicationsChannelPermissions(
  channel: TextChannel,
  guildId: string,
  botUserId: string,
): Promise<void> {
  await channel.permissionOverwrites.edit(botUserId, {
    ViewChannel: true,
    SendMessages: true,
    ManageChannels: true,
    ManageRoles: true,
  });

  await channel.permissionOverwrites.edit(guildId, {
    ViewChannel: false,
  });

  if (STAFF_ROLE_ID) {
    await channel.permissionOverwrites.edit(STAFF_ROLE_ID, {
      ViewChannel: true,
    });
  }
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const user = interaction.user;
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.guild) {
    await interaction.editReply({
      content: "Este comando solo se puede usar dentro de un servidor.",
    });
    return;
  }

  if (!areApplicationsOpen()) {
    await interaction.editReply({
      content: "❌ Las postulaciones para Trial Helper están actualmente cerradas. Por favor, espera a que el staff las abra nuevamente.",
    });
    return;
  }

  const now = Date.now();
  const cooldownKey = `${interaction.guildId}-${interaction.user.id}`;
  const lastUsed = lastUsedAt.get(cooldownKey);
  if (lastUsed !== undefined) {
    const elapsed = now - lastUsed;
    if (elapsed < COOLDOWN_MS) {
      await interaction.editReply({
        content: `Debes esperar ${formatRemainingCooldown(COOLDOWN_MS - elapsed)} antes de volver a postularte.`,
      });
      return;
    }
  }

  const checkChannel = await getOrCreateApplicationsChannel(interaction);
  if (checkChannel) {
    try {
      const messages = await checkChannel.messages.fetch({ limit: 100 });
      const existingApplication = messages.find(msg => 
        msg.author.id === interaction.client.user.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].description?.includes(`<@${user.id}>`) &&
        !msg.embeds[0].title?.includes("APROBADA") && 
        !msg.embeds[0].title?.includes("RECHAZADA")
      );

      if (existingApplication) {
        await interaction.editReply({
          content: "❌ Ya tienes una postulación en revisión. Espera a que el staff tome una decisión.",
        });
        return;
      }
    } catch (err) {
      console.error("[postular] Error al buscar duplicados:", err);
    }
  }

  const member = interaction.member;
  const tieneRolPostulado = (member?.roles as any).cache.some(
    (role: any) => role.name === "Postulados"
  );

  if (tieneRolPostulado) {
    await interaction.editReply({
      content: "❌ Ya tienes el rol de **Postulados**, por lo que no puedes iniciar otra postulación. Por favor, contacta al staff si crees que esto es un error.",
    });
    return;
  }

  let dmChannel;
  try {
    dmChannel = await user.createDM();

    const introEmbed = new EmbedBuilder()
      .setTitle("📩 POSTULACIÓN TRIAL HELPER")
      .setColor("Orange")
      .setImage("https://i.postimg.cc/BbwL7Ywv/240-sin-titulo-20260614011117.webp")
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
        `Si en cualquier momento quieres cancelar tu postulación, escribe "cancelar".`
      )
      .setFooter({ text: "¡Mucha suerte!"});

    await dmChannel.send({ embeds: [introEmbed]});
  } catch (err) {
    lastUsedAt.delete(`${interaction.guildId}-${interaction.user.id}`);
    logger.warn({ err, userId: user.id }, "Could not open DM with user");
    await interaction.editReply({
      content: "No pude enviarte un mensaje directo. Revisa tu configuración de privacidad y permite mensajes directos de miembros del servidor.",
    });
    return;
  }

  lastUsedAt.set(`${interaction.guildId}-${interaction.user.id}`, now);
  await interaction.editReply({
    content: "Te envié un mensaje directo para continuar con tu postulación.",
  });

  const answers: string[] = [];
  for (const question of QUESTIONS) {
    if (!areApplicationsOpen()) {
      lastUsedAt.delete(`${interaction.guildId}-${interaction.user.id}`);
      await dmChannel.send(
        "🔒 Las postulaciones fueron cerradas por el staff. Tu postulación fue cancelada. Podrás intentarlo nuevamente cuando el staff las abra.",
      );
      return;
    }

    await dmChannel.send(question);

    const { promise: closedPromise, cancel: cancelClosedWaiter } =
      createApplicationsClosedWaiter();

    try {
      const collected = await Promise.race([
        dmChannel.awaitMessages({
          filter: (msg: Message) => msg.author.id === user.id,
          max: 1,
        }),
        closedPromise,
      ]);
      const answer = collected.first()?.content ?? "";

      if (answer.trim().toLowerCase() === "cancelar") {
        await dmChannel.send(
          "La postulación ha sido cancelada correctamente. Podrás volver a postularte cuando termine tu tiempo de espera.",
        );
        return;
      }

      answers.push(answer);
    } catch (err) {
      if (err instanceof ApplicationsClosedError) {
        lastUsedAt.delete(`${interaction.guildId}-${interaction.user.id}`);
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

  let applicationsChannel: TextChannel | null = await getOrCreateApplicationsChannel(interaction);
  if (!applicationsChannel) {
    try {
      await dmChannel.send("⚠️ Hubo un problema al enviar tu postulación al staff. Por favor contacta a un administrador.");
    } catch (err) {}
    return;
  }

  // --- DETECCIÓN INTELIGENTE DE NIVEL POR ID ---
  const memberRoles = (interaction.member?.roles as any).cache;
  let nivelRoleMention = "Miembro";

  for (const item of NIVELES_ROLES_MAP) {
    if (memberRoles.has(item.id)) {
      nivelRoleMention = `<@&${item.id}>`;
      break; // Como está ordenado del más alto al más bajo, el primero que encuentre es el mayor
    }
  }
  // ---------------------------------------------

  const embed = new EmbedBuilder()
    .setTitle("📩 Nueva Postulación - Staff")
    .setColor("Orange")
    .setThumbnail(user.displayAvatarURL())
    .setDescription(`Postulación de <@${user.id}> (${user.username})`)
    .addFields(
      {
        name: "📅 Fecha de ingreso:",
        value: (interaction.member as any)?.joinedAt
          ? `<t:${Math.floor((interaction.member as any).joinedAt.getTime() / 1000)}:D>`
          : "Desconocido"
      },
      {
        name: "⭐ Nivel:",
        value: nivelRoleMention,
        inline: true
      },
      ...QUESTIONS.map((question, index) => ({
        name: question,
        value: answers[index] || "N/A",
      })),
    )
    .setFooter({ text: "Pendiente de revisión por staff" })
    .setTimestamp()
    .setImage("https://i.postimg.cc/s2n6Fjpt/file-000000004804720e90052ae92e4297c3.png");

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

  try {
    await applicationsChannel.send({
      embeds: [embed],
      components: [row],
    });
    await dmChannel.send("✅ Tu postulación fue enviada al staff.");
    await interaction.editReply({
      content: "✅ Tu postulación ha sido enviada correctamente al staff. Revisa tus mensajes directos.",
    });
  } catch (err) {
    await interaction.editReply({
      content: "⚠️ Tu postulación fue enviada al staff, pero hubo un detalle con los mensajes directos.",
    });
  }
}