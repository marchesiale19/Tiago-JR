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
  Routes
} from "discord.js";
import { commands } from "./commands";
import { logger } from "./lib/logger";
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// --- SERVIDOR HTTP PARA RENDER (WEB SERVICE) ---
const server = http.createServer((req, res) => {
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
    GatewayIntentBits.GuildVoiceStates, // required for voice channel management
    GatewayIntentBits.GuildMessages, // <--- Agregá esta línea aquí
    GatewayIntentBits.MessageContent, // <-- Necesario para leer mensajes con prefijo
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  logger.info({ tag: readyClient.user.tag }, "Discord bot logged in");
  // Run DB init + startup recovery once the client is fully connected
  import("./database/init")
    .then(({ initDatabase }) => initDatabase(readyClient))
    .catch((err) => logger.warn({ err }, "Database init failed — continuing without DB"));
});

const REJECTION_COOLDOWN = 7 * 24 * 60 * 60 * 1000; 


const REJECT_REASON_INPUT_ID = "postular_reject_reason";
const COOLDOWNS_FILE = path.join(__dirname, 'cooldowns.json');
const rejectionRegistry = loadCooldowns();
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

function hasReviewPermission(
  member: any, // Cambiamos a 'any' aquí para evitar conflictos de tipos
): boolean {
  // Verificación estricta: si el miembro no es un objeto o no tiene guild/roles, es falso
  if (!member || typeof member !== 'object') return false;

  // Si guild o roles no existen, TypeScript dejará de quejarse porque ya no intentamos acceder directamente
  if (!('guild' in member) || !member.guild || !('roles' in member) || !member.roles.cache) {
    return false;
  }

  const ROL_REFERENCIA = "Moderador [PB]";
  const rolReferencia = member.guild.roles.cache.find((r: any) => r.name === ROL_REFERENCIA);

  if (!rolReferencia) {
    return false;
  }

  return member.roles.cache.some((role: any) => role.position >= rolReferencia.position);
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

async function assignPostuladosRole(
  interaction: ButtonInteraction,
  applicantId: string,
): Promise<void> {
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
    console.log(`[DEBUG] Error crítico: No pude asignar el rol. ¿El bot tiene permisos? ¿Está el rol debajo del rol del bot?`);
    console.error(err);
  }
}

async function handleApprove(
  interaction: ButtonInteraction,
  applicantId: string,
    ): Promise<void> {
    // --- AÑADE ESTO AQUÍ ---
    if (interaction.message.embeds[0]?.title?.includes("APROBADA")) {
      return; // Si ya está aprobada, no hacemos nada más
    }
    // -----------------------

    const originalEmbed = interaction.message.embeds[0];

  const now = formatActionTimestamp(new Date());

  const updatedEmbed = originalEmbed
    ? EmbedBuilder.from(originalEmbed)
        .setColor("Green")
        .setTitle("✅ Postulación APROBADA")
    .setImage("https://i.postimg.cc/x86X0Z13/file-000000005990720eb92eca47227692a2.png")
        .setFooter({
          text: `✅ Aprobado por ${interaction.user.username} el ${now}`,
        })
    : null;

  try {
    await interaction.update({
      embeds: updatedEmbed ? [updatedEmbed] : undefined,
      components: [disabledRow],
    });
  } catch (err) {
    logger.warn({ err }, "Failed to update application message");
  }

  let applicant;
  try {
    applicant = await interaction.client.users.fetch(applicantId);
    await applicant.send(
      "Buenas notícias, tu postulación ha sido preseleccionada y has avanzado a la siguiente fase del proceso. Un miembro del staff se pondrá en contacto contigo a la brevedad para indicarte los pasos a seguir y coordinar la siguiente etapa, mantente atento.",
    );
  } catch (err) {
    logger.info({ err, applicantId }, "Could not DM applicant about decision");
  }

  await assignPostuladosRole(interaction, applicantId);
}

    async function handleRejectionModalSubmit(
      interaction: ModalSubmitInteraction,
    ): Promise<void> {
      // LOG DE DEBUG: Esto nos dirá si el evento llega y qué ID tiene
      console.log(`[DEBUG] Intentando procesar rechazo. ID del modal: ${interaction.customId}`);

      const match = interaction.customId.match(/^postular_reject_modal_(\d+)$/);

      if (!match) {
        // Si esto aparece en la consola, ya encontramos el error
        console.error(`[ERROR] El ID del modal no coincide con el formato esperado: ${interaction.customId}`);
        return;
      }

      const [, applicantId] = match;
      if (!applicantId) {
        console.error(`[ERROR] No se pudo extraer el ID del aplicante del ID: ${interaction.customId}`);
        return;
      }

      if (!hasReviewPermission(interaction.member)) {
        console.log(`[DEBUG] Usuario ${interaction.user.tag} sin permisos para rechazar.`);
        await interaction.reply({
          content: "No tienes permiso para revisar postulaciones.",
          ephemeral: true,
        });
        return;
      }

      // ... (el resto de tu código sigue igual)

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
      rejectionRegistry.set(cooldownKey, Date.now());   saveCooldowns(rejectionRegistry);

    try {
      const applicant = await interaction.client.users.fetch(applicantId);
      await applicant.send(`❌ Tu postulación fue RECHAZADA. Razón: ${reason}`);

      // Lógica para quitar el rol al ser rechazado
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
    .setLabel("Razon del rechazo")
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

  // Validación de Cooldown de 7 días para el comando /postular
    // Validación de Cooldown de 7 días para el comando /postular
  if (interaction.isChatInputCommand() && interaction.commandName === "postular") {
    // 1. Verificación de rechazo reciente (segunda fase)
    // 1. Verificación de rechazo reciente (segunda fase)
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
        rejectionRegistry.delete(interaction.user.id);
        saveCooldowns(rejectionRegistry);
      }
    }

    // 2. Verificación de rol activa
    const member = interaction.member;
    if (member && typeof member.roles !== 'string' && 'cache' in member.roles) {
      const tieneRolActivo = (member.roles as any).cache.some((r: any) => r.name === POSTULADOS_ROLE_NAME);
      if (tieneRolActivo) {
        await interaction.reply({
          content: "❌ Ya posees el rol de 'Postulados'. No puedes postularte nuevamente.",
          ephemeral: true
        });
        return;
      }
    }

    // Filtro de cuenta nueva
    const createdAt = interaction.user.createdAt;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (createdAt > sevenDaysAgo) {
      await interaction.reply({
        content: `❌ Tu cuenta es muy nueva para postularte. Debes tener al menos 7 días de antigüedad en Discord.`,
        ephemeral: true
      });
      return; // Importante
    }


    // Al final del bloque, si todo está bien, no necesitas retornar nada, 
    // pero si el código sigue, asegúrate de que el flujo natural continúe correctamente.
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

    // Supervisor accept button (posted in supervision channel)
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

    // In-game supervisor replacement button (supervision_replace_<lobbyId>)
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

    // Questionnaire open button (sent via DM to each participant)
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

    // Post-match play-again / leave buttons
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

    return;
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("postular_reject_modal_")) {
      try {
        await handleRejectionModalSubmit(interaction);
      } catch (err) {
        logger.error({ err }, "Error handling rejection modal submission");
        if (!interaction.replied && !interaction.deferred) {
          try {
            await interaction.reply({
              content: "Hubo un error al procesar el rechazo.",
              ephemeral: true,
            });
          } catch (replyErr) {
            logger.error(
              { err: replyErr },
              "Failed to send rejection modal error reply",
            );
          }
        }
      }
      return;
    }

    // Questionnaire form submit (q_form_<matchId>_<discordId>)
    if (interaction.customId.startsWith("q_form_")) {
      const rest = interaction.customId.slice("q_form_".length);
      const underscoreIdx = rest.indexOf("_");
      if (underscoreIdx !== -1) {
        const matchId   = rest.slice(0, underscoreIdx);
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
  if (!command) {
    logger.warn(
      { commandName: interaction.commandName },
      "Received unknown command",
    );
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error(
      { err, commandName: interaction.commandName },
      "Error executing command",
    );
    const errorMessage = {
      content: "Hubo un error al ejecutar este comando.",
      ephemeral: true,
    };
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(errorMessage);
  } else {
    await interaction.reply(errorMessage);
  }
  }
  });

  // --- PUENTE PARA COMANDOS CON PREFIJO "-" ---
  client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.content.startsWith("-")) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift()?.toLowerCase();

  if (!commandName) return;

  // Solución directa para el help
  if (commandName === "help") {
  try {
    const helpCmd = await import("./commands/help");
    await helpCmd.run(message, args);
  } catch (err) {
    logger.error({ err }, "Error executing help via prefix");
    await message.reply("Hubo un error al ejecutar este comando por prefijo.").catch(() => {});
  }
  return;
  }

  const command = commands.get(commandName);
  if (!command) return;

  try {
  const cmdAny = command as any;
  if (typeof cmdAny.run === "function") {
    await cmdAny.run(message, args);
  } else {
    await message.reply("Este comando no admite ejecución por prefijo.").catch(() => {});
  }
  } catch (err) {
  logger.error({ err, commandName }, "Error executing command via prefix");
  await message.reply("Hubo un error al ejecutar este comando por prefijo.").catch(() => {});
  }
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  // Aseguramos que solo actúe si el rol se pierde
  const role = newMember.guild.roles.cache.find(r => r.name === POSTULADOS_ROLE_NAME);
  if (!role) return;

  // Si tenía el rol (old) y ahora ya no lo tiene (new)
  if (oldMember.roles.cache.has(role.id) && !newMember.roles.cache.has(role.id)) {
    const cooldownKey = `${newMember.guild.id}-${newMember.id}`;
    rejectionRegistry.set(cooldownKey, Date.now());   saveCooldowns(rejectionRegistry);
    console.log(`[EVENTO] Rol ${POSTULADOS_ROLE_NAME} quitado a ${newMember.user.tag}. Cooldown aplicado.`);
  }
});
// --- FUNCIÓN DE REGISTRO AUTOMÁTICO ---
async function registrarComandos() {
  const token = process.env["DISCORD_BOT_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];

  if (!token || !clientId) {
    console.error("❌ Faltan DISCORD_BOT_TOKEN o DISCORD_CLIENT_ID para registrar comandos.");
    return;
  }

  const rest = new REST().setToken(token);
  // Transformamos la colección de comandos a formato JSON para Discord
  const body = Array.from(commands.values()).map(c => c.data.toJSON());

  try {
    console.log("🔄 Registrando comandos globalmente...");
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log("✅ Comandos registrados correctamente.");
  } catch (e) {
    console.error("❌ Error registrando comandos:", e);
  }
}

// Registramos comandos y hacemos login al iniciar
registrarComandos();

client.login(token).catch((err) => {
  logger.error({ err }, "Failed to log in to Discord");
  process.exit(1);
});
