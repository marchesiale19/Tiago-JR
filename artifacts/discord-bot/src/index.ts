import http from 'node:http';
import {
  Client,
  Events,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type GuildMember,
  REST,
  Routes,
  AuditLogEvent
} from "discord.js";
import { commands } from "./commands";
import { logger } from "./lib/logger";
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// --- SERVIDOR HTTP PARA RENDER (WEB SERVICE) ---
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running successfully!\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
// ----------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const token = process.env["DISCORD_BOT_TOKEN"];

if (!token) {
  throw new Error("DISCORD_BOT_TOKEN environment variable is required.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  logger.info({ tag: readyClient.user.tag }, "Discord bot logged in");
  import("./database/init")
    .then(({ initDatabase }) => initDatabase(readyClient))
    .catch((err) => logger.warn({ err }, "Database init failed — continuing without DB"));
});

const REJECTION_COOLDOWN = 7 * 24 * 60 * 60 * 1000; 
const REJECT_REASON_INPUT_ID = "postular_reject_reason";
const COOLDOWNS_FILE = path.join(__dirname, 'cooldowns.json');
const rejectionRegistry = loadCooldowns();

// --- REGISTRO DE BANEOS HISTÓRICOS ---
const BANS_FILE = path.join(__dirname, 'bans_registry.json');
const banRegistry = loadBansRegistry();

function loadBansRegistry(): Map<string, { reason: string; timestamp: number; moderator: string }> {
  try {
    if (fs.existsSync(BANS_FILE)) {
      const data = fs.readFileSync(BANS_FILE, 'utf-8');
      return new Map(Object.entries(JSON.parse(data)));
    }
  } catch (err) {
    logger.error({ err }, "Error cargando archivo de registro de bans");
  }
  return new Map();
}

function saveBansRegistry(map: Map<string, any>) {
  const obj = Object.fromEntries(map);
  fs.writeFileSync(BANS_FILE, JSON.stringify(obj, null, 2));
}

function loadCooldowns(): Map<string, number> {
  try {
    if (fs.existsSync(COOLDOWNS_FILE)) {
      const data = fs.readFileSync(COOLDOWNS_FILE, 'utf-8');
      return new Map(Object.entries(JSON.parse(data)));
    }
  } catch (err) {
    logger.error({ err }, "Error cargando archivo de cooldowns");
  }
  return new Map();
}

function saveCooldowns(map: Map<string, number>) {
  const obj = Object.fromEntries(map);
  fs.writeFileSync(COOLDOWNS_FILE, JSON.stringify(obj, null, 2));
}

function formatActionTimestamp(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Listas de roles autorizados
const ROLES_AUTORIZADOS = [
  "1451383215603585140", // Owner
  "1508266687689003039", // Co-Owner
  "1512634750152478851", // Jefe Staff
  "1485101671875874997", // Administrador Elite
];

const ROLES_FORENSIC_AUTORIZADOS = [
  ...ROLES_AUTORIZADOS,
  "1455419124732657801", // Equipo Administrativo
  "1522434536796061816", // Desarrollador
  "1453211902267228160", // Administrador
  "1509760475653472287", // Administrador [PB]
  "1522807097920720967", // Manager
  "1452784726413672643", // Moderador
  "1509760381525164123"  // Moderador [PB]
];

function hasReviewPermission(member: any): boolean {
  if (!member || typeof member !== 'object') return false;
  if (!('guild' in member) || !member.guild || !('roles' in member) || !member.roles.cache) {
    return false;
  }
  return ROLES_AUTORIZADOS.some((roleId) => member.roles.cache.has(roleId));
}

function hasForensicPermission(member: any): boolean {
  if (!member || typeof member !== 'object') return false;
  if (!('guild' in member) || !member.guild || !('roles' in member) || !member.roles.cache) {
    return false;
  }
  return ROLES_FORENSIC_AUTORIZADOS.some((roleId) => member.roles.cache.has(roleId));
}

const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder()
    .setCustomId("postular_approve_disabled")
    .setLabel("Aceptar")
    .setStyle(ButtonStyle.Success)
    .setDisabled(true),
  new ButtonBuilder()
    .setCustomId("postular_reject_disabled")
    .setLabel("Rechazar")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(true),
);

const POSTULADOS_ROLE_NAME = "Postulados";

async function assignPostuladosRole(interaction: ButtonInteraction, applicantId: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  await guild.roles.fetch();
  const role = guild.roles.cache.find((r) => r.name === POSTULADOS_ROLE_NAME);

  if (!role) {
    console.log(`[DEBUG] Error: No encontré el rol llamado "${POSTULADOS_ROLE_NAME}"`);
    return;
  }

  try {
    const member = await guild.members.fetch(applicantId);
    await member.roles.add(role);
    console.log(`[DEBUG] ¡Rol "${role.name}" asignado correctamente a ${member.user.tag}!`);
  } catch (err) {
    console.log(`[DEBUG] Error crítico: No pude asignar el rol.`);
    console.error(err);
  }
}

async function handleApprove(interaction: ButtonInteraction, applicantId: string): Promise<void> {
  if (interaction.message.embeds[0]?.title?.includes("APROBADA")) {
    return; 
  }

  const originalEmbed = interaction.message.embeds[0];
  const now = formatActionTimestamp(new Date());

  const updatedEmbed = originalEmbed
    ? EmbedBuilder.from(originalEmbed)
        .setColor("Green")
        .setTitle("✅ Postulación APROBADA")
        .setImage("https://i.postimg.cc/x86X0Z13/file-000000005990720eb92eca47227692a2.png")
        .setFooter({ text: `✅ Aprobado por ${interaction.user.username} el ${now}` })
    : null;

  try {
    await interaction.update({
      embeds: updatedEmbed ? [updatedEmbed] : undefined,
      components: [disabledRow],
    });
  } catch (err) {
    logger.warn({ err }, "Failed to update application message");
  }

  try {
    const applicant = await interaction.client.users.fetch(applicantId);
    await applicant.send(
      "Buenas noticias, tu postulación ha sido preseleccionada y has avanzado a la siguiente fase del proceso. Un miembro del staff se pondrá en contacto contigo a la brevedad.",
    );
  } catch (err) {
    logger.info({ err, applicantId }, "Could not DM applicant about decision");
  }

  await assignPostuladosRole(interaction, applicantId);
}

async function handleRejectionModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const match = interaction.customId.match(/^postular_reject_modal_(\d+)$/);

  if (!match) {
    console.error(`[ERROR] El ID del modal no coincide con el formato esperado: ${interaction.customId}`);
    return;
  }

  const [, applicantId] = match;
  if (!applicantId) return;

  if (!hasReviewPermission(interaction.member)) {
    await interaction.reply({
      content: "No tienes permiso para revisar postulaciones.",
      ephemeral: true,
    });
    return;
  }

  const reason = interaction.fields.getTextInputValue(REJECT_REASON_INPUT_ID).trim();
  const message = interaction.message;
  const originalEmbed = message?.embeds[0];
  const now = formatActionTimestamp(new Date());

  const updatedEmbed = originalEmbed
    ? EmbedBuilder.from(originalEmbed)
        .setColor("Red")
        .setTitle("❌ Postulación RECHAZADA")
        .addFields({ name: "Razón del rechazo", value: reason })
        .setImage("https://i.postimg.cc/k5NXJHjB/file000000003dfc720e904bc161db2db57a.png") 
        .setFooter({ text: `❌ Rechazado por ${interaction.user.username} el ${now}` })
    : null;

  try {
    if (interaction.isFromMessage()) {
      await interaction.update({
        embeds: updatedEmbed ? [updatedEmbed] : undefined,
        components: [disabledRow],
      });
    } else {
      await interaction.deferUpdate();
    }
  } catch (err) {
    logger.warn({ err }, "Failed to update application message");
  }

  const cooldownKey = `${interaction.guildId}-${applicantId}`;
  rejectionRegistry.set(cooldownKey, Date.now());
  saveCooldowns(rejectionRegistry);

  try {
    const applicant = await interaction.client.users.fetch(applicantId);
    await applicant.send(`❌ Tu postulación fue RECHAZADA. Razón: ${reason}`);

    const guild = interaction.guild;
    if (guild) {
      const role = guild.roles.cache.find((r) => r.name === POSTULADOS_ROLE_NAME);
      const member = await guild.members.fetch(applicantId);
      if (role && member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
      }
    }
  } catch (err) {
    logger.info({ err, applicantId }, "Could not DM applicant or remove role");
  }
}

async function handleRejectButton(interaction: ButtonInteraction, applicantId: string): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`postular_reject_modal_${applicantId}`)
    .setTitle("Razón del rechazo");

  const reasonInput = new TextInputBuilder()
    .setCustomId(REJECT_REASON_INPUT_ID)
    .setLabel("Razón del rechazo")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
  modal.addComponents(row);

  try {
    await interaction.showModal(modal);
  } catch (err) {
    logger.error({ err, applicantId }, "Failed to show rejection modal");
  }
}

async function handlePostulationDecision(interaction: ButtonInteraction): Promise<void> {
  const match = interaction.customId.match(/^postular_(approve|reject)_(\d+)$/);
  if (!match) return;

  const [, decision, applicantId] = match;
  if (!applicantId) return;

  if (!hasReviewPermission(interaction.member)) {
    await interaction.reply({ content: "No tienes permiso.", ephemeral: true });
    return;
  }

  if (decision === "approve") {
    await handleApprove(interaction, applicantId);
  } else {
    await handleRejectButton(interaction, applicantId);
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === "postular") {
    const cooldownKey = `${interaction.guildId}-${interaction.user.id}`;
    const rejectionTime = rejectionRegistry.get(cooldownKey);

    if (rejectionTime) {
      const elapsed = Date.now() - rejectionTime;
      if (elapsed < REJECTION_COOLDOWN) {
        const daysLeft = Math.ceil((REJECTION_COOLDOWN - elapsed) / (24 * 60 * 60 * 1000));
        await interaction.reply({
          content: `❌ Fuiste rechazado recientemente. Debes esperar ${daysLeft} días para volver a postularte.`,
          ephemeral: true
        });
        return;
      } else {
        rejectionRegistry.delete(cooldownKey);
        saveCooldowns(rejectionRegistry);
      }
    }

    const member = interaction.member;
    if (member && typeof member !== 'string' && 'roles' in member) {
      const tieneRolActivo = (member.roles as any).cache.some((r: any) => r.name === POSTULADOS_ROLE_NAME);
      if (tieneRolActivo) {
        await interaction.reply({
          content: "❌ Ya posees el rol de 'Postulados'. No puedes postularte nuevamente.",
          ephemeral: true
        });
        return;
      }
    }

    const createdAt = interaction.user.createdAt;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (createdAt > sevenDaysAgo) {
      await interaction.reply({
        content: `❌ Tu cuenta es muy nueva para postularte. Debes tener al menos 7 días de antigüedad.`,
        ephemeral: true
      });
      return;
    }

    const command = commands.get("postular");
    if (command) {
      try {
        await command.execute(interaction);
      } catch (err) {
        logger.error({ err }, "Error executing postular command");
      }
    }
    return;
  }

  if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        logger.error({ err, commandName: interaction.commandName }, "Error handling autocomplete");
      }
    }
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith("postular_")) {
      try {
        await handlePostulationDecision(interaction);
      } catch (err) {
        logger.error({ err }, "Error handling postulation decision button");
      }
      return;
    }

    if (interaction.customId.startsWith("supervision_accept_")) {
      const lobbyId = interaction.customId.slice("supervision_accept_".length);
      const member = interaction.member as GuildMember | null;
      if (!member) {
        await interaction.reply({ content: "❌ Este botón sólo funciona desde el servidor.", ephemeral: true });
        return;
      }
      try {
        const { handleSupervisionAccept } = await import("./services/SupervisorService");
        await interaction.deferReply({ ephemeral: true });
        await handleSupervisionAccept(interaction.user.id, lobbyId, member, interaction.client);
        await interaction.editReply("✅ Has aceptado la supervisión. La partida ha comenzado.");
      } catch (err: any) {
        logger.error({ err, lobbyId }, "Error handling supervision accept");
        if (interaction.deferred) {
          await interaction.editReply(`❌ ${err?.message ?? "Error al aceptar la supervisión."}`).catch(() => {});
        }
      }
      return;
    }

    if (interaction.customId.startsWith("supervision_replace_")) {
      const lobbyId = interaction.customId.slice("supervision_replace_".length);
      const member = interaction.member as GuildMember | null;
      if (!member) {
        await interaction.reply({ content: "❌ Este botón sólo funciona desde el servidor.", ephemeral: true });
        return;
      }
      try {
        const { handleSupervisionReplace } = await import("./services/SupervisorService");
        await interaction.deferReply({ ephemeral: true });
        await handleSupervisionReplace(interaction.user.id, lobbyId, member, interaction.client);
        await interaction.editReply("✅ Has tomado el control de la partida como supervisor de reemplazo.");
      } catch (err: any) {
        logger.error({ err, lobbyId }, "Error handling supervision replace");
        if (interaction.deferred) {
          await interaction.editReply(`❌ ${err?.message ?? "Error al aceptar el reemplazo."}`).catch(() => {});
        }
      }
      return;
    }

    if (interaction.customId.startsWith("q_open_")) {
      const [matchId, discordId] = interaction.customId.slice("q_open_".length).split("_");
      if (matchId && discordId) {
        try {
          const { openQuestionnaireModal } = await import("./services/QuestionnaireService");
          await openQuestionnaireModal(interaction, matchId, discordId);
        } catch (err) {
          logger.error({ err }, "Error opening questionnaire modal");
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "❌ Error al abrir el cuestionario.", ephemeral: true }).catch(() => {});
          }
        }
      }
      return;
    }

    if (interaction.customId.startsWith("play_again_")) {
      const matchId = interaction.customId.slice("play_again_".length);
      try {
        const { handlePlayAgain } = await import("./services/QuestionnaireService");
        await interaction.deferReply({ ephemeral: true });
        await handlePlayAgain(matchId, interaction.user.id, interaction.client);
        await interaction.editReply("🎮 ¡Quedas en el canal para la próxima partida!");
      } catch (err) {
        logger.error({ err }, "Error handling play again");
        if (interaction.deferred) {
          await interaction.editReply("❌ Error al procesar la acción.").catch(() => {});
        }
      }
      return;
    }

    if (interaction.customId.startsWith("leave_match_")) {
      const matchId = interaction.customId.slice("leave_match_".length);
      try {
        const { handleLeaveMatch } = await import("./services/QuestionnaireService");
        await interaction.deferReply({ ephemeral: true });
        await handleLeaveMatch(matchId, interaction.user.id, interaction.client);
        await interaction.editReply("🚪 Has salido del canal de voz.");
      } catch (err) {
        logger.error({ err }, "Error handling leave match");
        if (interaction.deferred) {
          await interaction.editReply("❌ Error al procesar la salida.").catch(() => {});
        }
      }
      return;
    }

    if (interaction.customId.startsWith("forensic_quarantine_") || interaction.customId.startsWith("forensic_ignore_")) {
      const member = interaction.member as GuildMember | null;

      if (!hasForensicPermission(member)) {
        await interaction.reply({
          content: "❌ No tienes los permisos necesarios para interactuar con esta alerta.",
          ephemeral: true
        });
        return;
      }

      const action = interaction.customId.startsWith("forensic_quarantine_") ? "aislar" : "ignorar";
      const targetUserId = interaction.customId.replace(action === "aislar" ? "forensic_quarantine_" : "forensic_ignore_", "");

      if (action === "aislar") {
        const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`forensic_confirm_quarantine_${targetUserId}`)
            .setLabel("Sí, aislar usuario")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("forensic_cancel_quarantine")
            .setLabel("Cancelar")
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({
          content: `⚠️ ¿Estás seguro de que deseas enviar a cuarentena a <@${targetUserId}>? Esta acción restringirá al usuario.`,
          components: [confirmRow],
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        content: `✅ Marcado como seguro para <@${targetUserId}> por ${interaction.user.tag}.`,
        ephemeral: true
      });

      await interaction.message.edit({ components: [] }).catch(() => {});
      return;
    }

    if (interaction.customId.startsWith("forensic_confirm_quarantine_")) {
      const member = interaction.member as GuildMember | null;
      if (!hasForensicPermission(member)) {
        await interaction.reply({ content: "❌ Sin permisos.", ephemeral: true });
        return;
      }

      const targetUserId = interaction.customId.replace("forensic_confirm_quarantine_", "");

      try {
        const guildMember = await interaction.guild?.members.fetch(targetUserId);
        if (guildMember) {
          const rolesToKeep = guildMember.roles.cache.filter(r => r.managed || r.id === interaction.guild?.id);
          await guildMember.roles.set(rolesToKeep).catch(() => {});

          await interaction.update({
            content: `🚨 <@${targetUserId}> ha sido aislado correctamente por ${interaction.user.tag} (roles retirados).`,
            components: []
          });

          await interaction.message.edit({ components: [] }).catch(() => {});
        } else {
          await interaction.update({ content: "❌ El usuario ya no se encuentra en el servidor.", components: [] });
        }
      } catch (err) {
        logger.error({ err }, "Error al aislar al usuario en cuarentena");
        await interaction.update({ content: "❌ Hubo un error al intentar aplicar el aislamiento.", components: [] });
      }
      return;
    }

    if (interaction.customId === "forensic_cancel_quarantine") {
      await interaction.update({ content: "❌ Acción de aislamiento cancelada.", components: [] });
      return;
    }

    return;
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("postular_reject_modal_")) {
      try {
        await handleRejectionModalSubmit(interaction);
      } catch (err) {
        logger.error({ err }, "Error handling rejection modal submission");
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "Hubo un error al procesar el rechazo.", ephemeral: true }).catch(() => {});
        }
      }
      return;
    }

    if (interaction.customId.startsWith("q_form_")) {
      const rest = interaction.customId.slice("q_form_".length);
      const underscoreIdx = rest.indexOf("_");
      if (underscoreIdx !== -1) {
        const matchId = rest.slice(0, underscoreIdx);
        const discordId = rest.slice(underscoreIdx + 1);
        try {
          const { recordAnswer } = await import("./services/QuestionnaireService");
          await recordAnswer(interaction, matchId, discordId, interaction.client);
        } catch (err) {
          logger.error({ err }, "Error recording questionnaire answer");
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "❌ Error al registrar tu respuesta.", ephemeral: true }).catch(() => {});
          }
        }
      }
      return;
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error({ err, commandName: interaction.commandName }, "Error executing command");
    const errorMessage = { content: "Hubo un error al ejecutar este comando.", ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.content.startsWith("-")) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift()?.toLowerCase();
  if (!commandName) return;

  const command = commands.get(commandName);
  if (!command) return;

  try {
    const cmdAny = command as any;
    if (typeof cmdAny.run === "function") {
      await cmdAny.run(message, args);
      return;
    }

    const fakeInteraction = {
      commandName: commandName,
      user: message.author,
      client: message.client,
      guild: message.guild,
      guildId: message.guild?.id,
      member: message.member,
      channel: message.channel,
      options: {
        getSubcommand: () => {
          const firstArg = args[0]?.toLowerCase();
          return (firstArg === "temporada" || firstArg === "postulaciones") ? firstArg : null;
        },
        getString: () => args.join(" ") || null,
        getInteger: () => parseInt(args[0]) || null,
        getBoolean: () => args[1] === "true" || args[0] === "true",
        getUser: () => message.mentions.users.first() || null,
        getMember: () => message.mentions.members?.first() || null,
        getChannel: () => message.mentions.channels.first() || null,
      },
      replied: false,
      deferred: false,
      isChatInputCommand: () => true,
      isCommand: () => true,
      async reply(options: any) {
        this.replied = true;
        const content = typeof options === "string" ? options : options.content;
        return message.reply({ content, embeds: options.embeds || [], components: options.components || [] });
      },
      async followUp(options: any) {
        const content = typeof options === "string" ? options : options.content;
        return message.channel.send({ content, embeds: options.embeds || [], components: options.components || [] });
      },
      async deferReply() {
        this.deferred = true;
      },
      async editReply(options: any) {
        const content = typeof options === "string" ? options : options.content;
        return message.reply({ content, embeds: options.embeds || [], components: options.components || [] });
      }
    };

    await command.execute(fakeInteraction as any);
  } catch (err) {
    logger.error({ err, commandName }, "Error executing command via automatic prefix bridge");
    await message.reply(`Hubo un error al ejecutar este comando por prefijo: \`${err}\``).catch(() => {});
  }
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const role = newMember.guild.roles.cache.find(r => r.name === POSTULADOS_ROLE_NAME);
  if (!role) return;

  if (oldMember.roles.cache.has(role.id) && !newMember.roles.cache.has(role.id)) {
    const cooldownKey = `${newMember.guild.id}-${newMember.id}`;
    rejectionRegistry.set(cooldownKey, Date.now());
    saveCooldowns(rejectionRegistry);
    console.log(`[EVENTO] Rol ${POSTULADOS_ROLE_NAME} quitado a ${newMember.user.tag}. Cooldown aplicado.`);
  }
});

// Registro actualizado usando la enumeración de AuditLogEvent
client.on(Events.GuildBanAdd, async (ban) => {
  try {
    // Pequeño delay de 500ms para asegurar que Discord escriba el log de auditoría
    await new Promise(resolve => setTimeout(resolve, 500));

    const fetchedLogs = await ban.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.MemberBanAdd,
    });
    const banLog = fetchedLogs.entries.first();
    const executor = banLog?.executor?.tag ?? "Staff"; // <-- Solucionado aquí
    const reason = banLog?.reason ?? ban.reason ?? "Sin razón especificada";

    banRegistry.set(ban.user.id, {
      reason,
      timestamp: Date.now(),
      moderator: executor,
    });
    saveBansRegistry(banRegistry);

    logger.info({ userId: ban.user.id, tag: ban.user.tag }, "Usuario baneado registrado en el historial forense");
  } catch (err) {
    logger.error({ err }, "Error al registrar baneo en ForensicRegistry");
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const { ForensicService } = await import("./services/ForensicService");
    const user = member.user;

    const previousBan = banRegistry.get(user.id);

    const evaluation = ForensicService.evaluateMember(
      user.id,
      user.tag ?? user.username ?? "Desconocido",
      user.createdAt,
      user.bot ? false : user.avatar === null
    );

    if (previousBan) {
      evaluation.riskScore = 100;
      evaluation.reasons.unshift(`🚨 ¡ESTUVO BANEADO ANTES! Razón previa: "${previousBan.reason}"`);
    }

    if (evaluation.riskScore >= 75 || evaluation.isSuspiciousCluster || previousBan) {
      const STAFF_LOG_CHANNEL_ID = "1522430713746424001"; 
      const channel = member.guild.channels.cache.get(STAFF_LOG_CHANNEL_ID);

      if (channel && channel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor("Red")
          .setTitle("🚨 Alerta Forense: Usuario con Antecedentes")
          .setDescription(`Se detectó el ingreso de una cuenta sospechosa o previamente sancionada.`)
          .addFields(
            { name: "Usuario", value: `<@${evaluation.userId}> (${evaluation.username})`, inline: true },
            { name: "Riesgo Calculado", value: `${evaluation.riskScore}%`, inline: true },
            { name: "Razones", value: evaluation.reasons.map(r => `• ${r}`).join("\n") }
          )
          .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`forensic_quarantine_${evaluation.userId}`)
            .setLabel("Aislar / Cuarentena")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`forensic_ignore_${evaluation.userId}`)
            .setLabel("Marcar como Seguro")
            .setStyle(ButtonStyle.Success)
        );

        await channel.send({ embeds: [embed], components: [row] });
      }
    }
  } catch (err) {
    logger.error({ err }, "Error handling guildMemberAdd forensic evaluation");
  }
});

async function registrarComandos() {
  const token = process.env["DISCORD_BOT_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];

  if (!token || !clientId) {
    console.error("❌ Faltan DISCORD_BOT_TOKEN o DISCORD_CLIENT_ID para registrar comandos.");
    return;
  }

  const rest = new REST().setToken(token);
  const body = Array.from(commands.values()).map(c => c.data.toJSON());

  try {
    console.log("🔄 Registrando comandos globalmente...");
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log("✅ Comandos registrados correctamente.");
  } catch (e) {
    console.error("❌ Error registrando comandos:", e);
  }
}

registrarComandos();

client.login(token).catch((err) => {
  logger.error({ err }, "Failed to log in to Discord");
  process.exit(1);
});