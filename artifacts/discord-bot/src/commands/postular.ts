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

const STAFF_ROLE_ID = process.env["STAFF_ROLE_ID"];

const QUESTIONS = [
  "Nombre:",
  "Edad:",
  "¿Tienes experiencia de staff?",
  "¿Con quién te sueles llevar en el server?",
  "¿Qué aportarías como STAFF?",
  "¿Qué tan activo eres a la semana?",
];

const COOLDOWN_MS = 5 * 60 * 1000;
const APPLICATIONS_CHANNEL_NAME = "postulaciones-staff";

const lastUsedAt = new Map<string, number>();

function formatRemainingCooldown(msRemaining: number): string {
  const totalSeconds = Math.ceil(msRemaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}


async function getOrCreateApplicationsChannel(
  interaction: ChatInputCommandInteraction,
): Promise<TextChannel | null> {
  const guild = interaction.guild;
  if (!guild) {
    console.log("[postular] No guild on interaction, aborting channel lookup.");
    return null;
  }

  const botUserId = interaction.client.user.id;

  console.log(
    `[postular] Guild obtained: id=${guild.id} name="${guild.name}"`,
  );

  console.log(
    `[postular] Searching for existing channel named "${APPLICATIONS_CHANNEL_NAME}"...`,
  );

  let existing;
  try {
    // Make sure the channel cache is fresh in case the channel exists but
    // wasn't cached yet (e.g. bot just started).
    await guild.channels.fetch();
    existing = guild.channels.cache.find(
      (channel) =>
        channel.name === APPLICATIONS_CHANNEL_NAME &&
        channel.type === ChannelType.GuildText,
    );
  } catch (err) {
    console.error(
      `[postular] ERROR while fetching/searching guild channels:`,
      err,
    );
    return null;
  }

  if (existing) {
    console.log(
      `[postular] Found existing channel: id=${existing.id} name="${existing.name}"`,
    );
    const existingChannel = existing as TextChannel;
    console.log(
      `[postular] Ensuring existing channel id=${existingChannel.id} has correct private permissions...`,
    );
    try {
      await applyApplicationsChannelPermissions(
        existingChannel,
        guild.id,
        botUserId,
      );
      console.log(
        `[postular] Permissions verified/updated on existing channel id=${existingChannel.id}`,
      );
    } catch (err) {
      console.error(
        `[postular] ERROR updating permissions on existing channel id=${existingChannel.id}:`,
        err,
      );
      logger.warn(
        { err, channelId: existingChannel.id },
        "Failed to update permissions on existing applications channel",
      );
    }
    return existingChannel;
  }

  console.log(
    `[postular] Channel "${APPLICATIONS_CHANNEL_NAME}" not found. Attempting to create it...`,
  );

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
    console.log(
      `[postular] Successfully created private channel: id=${created.id} name="${created.name}"`,
    );
    return created;
  } catch (err) {
    console.error(
      `[postular] ERROR creating channel "${APPLICATIONS_CHANNEL_NAME}" in guild ${guild.id}:`,
      err,
    );
    logger.warn(
      { err, guildId: guild.id },
      "Failed to create applications channel",
    );
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
  // Ensure the bot itself always retains access to the channel it manages.
  // Without this explicit overwrite, denying @everyone ViewChannel also
  // blocks the bot (unless it has Administrator), causing "Missing Access"
  // (50001) on every subsequent fetch/edit/send call to this channel.
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
      content:
        "❌ Las postulaciones para Trial Helper están actualmente cerradas. Por favor, espera a que el staff las abra nuevamente.",
    });
    return;
  }

  const now = Date.now();
  // Combinamos el ID del servidor y el del usuario
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

  // --- VALIDACIÓN INTELIGENTE ---
  const checkChannel = await getOrCreateApplicationsChannel(interaction);
  if (checkChannel) {
    try {
      const messages = await checkChannel.messages.fetch({ limit: 100 });

      const existingApplication = messages.find(msg => 
        msg.author.id === interaction.client.user.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].description?.includes(`<@${user.id}>`) &&
        // El bot ahora solo bloquea si el título NO contiene las palabras de éxito o fracaso
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
  // --------------------------------------------------------
  // --- NUEVA VALIDACIÓN: Rol de Postulados por nombre ---
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
  // -----------------------------------------------------
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
    .setFooter({ text: "¡Mucha suerte!"})

    await dmChannel.send({ embeds: [introEmbed]})

  } catch (err) {
    lastUsedAt.delete(`${interaction.guildId}-${interaction.user.id}`);
    logger.warn({ err, userId: user.id }, "Could not open DM with user");
    await interaction.editReply({
      content:
        "No pude enviarte un mensaje directo. Revisa tu configuración de privacidad y permite mensajes directos de miembros del servidor.",
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

      logger.info(
        { userId: user.id },
        "Postulation cancelled: applications closed before next question",
      );
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
        // Al NO borrar el cooldown, el usuario sigue "bloqueado" 
        // hasta que pasen los 5 minutos originales.
        logger.info(
          { userId: user.id },
          "Postulation cancelled by user via 'cancelar' keyword",
        );
        await dmChannel.send(
          "La postulación ha sido cancelada correctamente. Podrás volver a postularte cuando termine tu tiempo de espera.",
        );
        return;
      }

      answers.push(answer);
    } catch (err) {
      if (err instanceof ApplicationsClosedError) {
        lastUsedAt.delete(`${interaction.guildId}-${interaction.user.id}`);        logger.info(
          { userId: user.id },
          "Postulation cancelled: applications closed mid-questionnaire",
        );
        await dmChannel.send(
          "🔒 Las postulaciones fueron cerradas por el staff mientras respondías. Tu postulación fue cancelada. Podrás intentarlo nuevamente cuando el staff las abra.",
        );
        return;
      }
      logger.warn(
        { err, userId: user.id },
        "Unexpected error while awaiting an answer",
      );
      await dmChannel.send(
        "⚠️ Hubo un problema inesperado durante tu postulación. Tu postulación fue cancelada. Usa /postular de nuevo cuando quieras intentarlo.",
      );
      return;
    } finally {
      cancelClosedWaiter();
    }
  }

  console.log(
    `[postular] Questionnaire finished for userId=${user.id} username=${user.username}. Answers:`,
    answers,
  );
  logger.info(
    { userId: user.id, username: user.username },
    "Postulation completed",
  );

  let applicationsChannel: TextChannel | null;
  try {
    applicationsChannel = await getOrCreateApplicationsChannel(interaction);
  } catch (err) {
    console.error(
      `[postular] ERROR while resolving applications channel:`,
      err,
    );
    applicationsChannel = null;
  }

  if (!applicationsChannel) {
    console.error(
      `[postular] Aborting: no applications channel available for userId=${user.id} guildId=${interaction.guild.id}. Application was NOT posted.`,
    );
    logger.warn(
      { userId: user.id, guildId: interaction.guild.id },
      "No applications channel available to post to",
    );
    try {
      await dmChannel.send(
        "⚠️ Hubo un problema al enviar tu postulación al staff. Por favor contacta a un administrador.",
      );
    } catch (err) {
      console.error(
        `[postular] ERROR sending failure notice DM to userId=${user.id}:`,
        err,
      );
    }
    return;
  }

  const NIVELES_ROLES = [
    "Super Miembro", "Fans de Bax", "Super Fans de Bax", "Mega Fans de Bax",
    "Super Hiper Fan de Bax", "Secret", "OG", "Nivel 90", "Nivel 100"
  ];

  const nivelRole = (interaction.member?.roles as any).cache
  .filter((role: any) => NIVELES_ROLES.includes(role.name))
  .sort((a: any, b: any) => b.position - a.position)
  .first();
  
const embed = new EmbedBuilder()
    .setTitle("📩 Nueva Postulación - Staff")
    .setColor("Yellow")
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
      value: nivelRole 
        ? nivelRole.toString() 
        : (interaction.guild?.roles.cache.find(r => r.name === "Miembros")?.toString() || "Miembro"),
      inline: true
    },

      ...QUESTIONS.map((question, index) => ({
        name: question,
        value: answers[index] || "N/A",
      })),
    )
  
    .setFooter({ text: "Pendiente de revisión por staff" })
    .setTimestamp()
.setImage("https://i.postimg.cc/s2n6Fjpt/file-000000004804720e90052ae92e4297c3.png")
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

  console.log(
    `[postular] Sending application embed to channel id=${applicationsChannel.id} name="${applicationsChannel.name}"...`,
  );

  let sentMessage;
  try {
    sentMessage = await applicationsChannel.send({
      embeds: [embed],
      components: [row],
    });
    console.log(
      `[postular] Embed sent successfully. messageId=${sentMessage.id} channelId=${applicationsChannel.id}`,
    );
  } catch (err) {
    console.error(
      `[postular] ERROR sending embed to channel id=${applicationsChannel.id} name="${applicationsChannel.name}":`,
      err,
    );
    logger.warn(
      { err, channelId: applicationsChannel.id },
      "Failed to post application to applications channel",
    );
    try {
      await dmChannel.send(
        "⚠️ Hubo un problema al enviar tu postulación al staff. Por favor contacta a un administrador.",
      );
    } catch (dmErr) {
      console.error(
        `[postular] ERROR sending failure notice DM to userId=${user.id}:`,
        dmErr,
      );
    }
    return;
  }

    console.log(`[postular] Sending success confirmation DM to userId=${user.id}...`);
  try {
    await dmChannel.send("✅ Tu postulación fue enviada al staff.");

    // Cerramos la interacción en el servidor con editReply
    await interaction.editReply({
      content: "✅ Tu postulación ha sido enviada correctamente al staff. Revisa tus mensajes directos.",
    });

    console.log(`[postular] Success confirmation DM sent to userId=${user.id}.`);
  } catch (err) {
    console.error(`[postular] ERROR sending success confirmation DM to userId=${user.id}:`, err);

    // Si falla el DM, avisamos por el comando original en el servidor
    await interaction.editReply({
      content: "⚠️ Tu postulación fue enviada al staff, pero no pude enviarte el mensaje de confirmación por DM. Revisa tus mensajes privados.",
    });
  }
} 
