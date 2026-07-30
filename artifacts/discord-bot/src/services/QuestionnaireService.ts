// ---------------------------------------------------------------------------
// QuestionnaireService — DM questionnaire lifecycle for ranked matches.
//
// Flow:
//   1. startQuestionnaire()  — sends a DM to every participant (incl. supervisor)
//                              with a "Responder" button.  Starts a 15-min timer.
//   2. openModal()           — called from index.ts when a player presses the button.
//                              Shows a 3-field modal (AU ID, role, MVP vote).
//   3. recordAnswer()        — called from index.ts when the modal is submitted.
//                              On all-answered or timeout → finalizeQuestionnaire().
//   4. finalizeQuestionnaire() — derives impostors from answers, tallies MVP votes,
//                              calls closeMatchAtomic, posts public results, posts
//                              Play Again / Leave buttons.
// ---------------------------------------------------------------------------

import {
  Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type ModalSubmitInteraction, type Guild,
} from "discord.js";
import { db } from "../database/database";
import {
  participantesPartidaTable,
  historialEloTable,
  estadisticasTemporadaTable,
  usuariosTable,
  votosMvpTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { lobbyRepository }   from "../database/repositories/LobbyRepository";
import { matchRepository }   from "../database/repositories/MatchRepository";
import { userRepository }    from "../database/repositories/UserRepository";
import { seasonRepository }  from "../database/repositories/SeasonRepository";
import { auditoriaRepository } from "../database/repositories/AuditoriaRepository";
import { finalizeMatchClose } from "./MatchService";
import { disconnectFromVC }  from "./RankedVCService";
import { getConfig }         from "./ConfigService";
import { ConfigKey, AuditModulo, EloMotivo } from "../database/enums";
import { DEFAULT_ELO }       from "./EloService";
import { logger } from "../lib/logger";

// ── Constants ─────────────────────────────────────────────────────────────

const QUESTIONNAIRE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const ABANDON_ELO_PENALTY      = 20;              // ELO lost for not answering

const IMPOSTOR_ROLES = new Set(["impostor", "shapeshifter", "phantom"]);

// ── State ──────────────────────────────────────────────────────────────────

interface QuestionnaireAnswer {
  amountUsId:   string;
  roleAmongUs:  string;
  mvpVoteIndex: number | null; // 1-based index into participantIds, or null
}

interface PendingQuestionnaire {
  matchId:        string;
  lobbyId:        string;
  guildId:        string;
  supervisorId:   string;
  ganador:        "TRIPULANTES" | "IMPOSTORES";
  participantIds: string[];                       // all 15 players in order
  leaverIds:      Set<string>;                    // pre-identified by supervisor
  answers:        Map<string, QuestionnaireAnswer>;
  timeout:        ReturnType<typeof setTimeout>;
  finished:       boolean;
  client:         Client;
}

// matchId → state
const pending = new Map<string, PendingQuestionnaire>();
// "discordId:matchId" → matchId (reverse lookup for button interactions)
const playerMatchIndex = new Map<string, string>();

// ── Public API ─────────────────────────────────────────────────────────────

export async function startQuestionnaire(
  matchId:      string,
  lobbyId:      string,
  guildId:      string,
  supervisorId: string,
  ganador:      "TRIPULANTES" | "IMPOSTORES",
  participantIds: string[],
  leaverIds:    string[],
  client:       Client,
): Promise<void> {
  if (pending.has(matchId)) {
    logger.warn({ matchId }, "Questionnaire already started for this match");
    return;
  }

  const state: PendingQuestionnaire = {
    matchId,
    lobbyId,
    guildId,
    supervisorId,
    ganador,
    participantIds,
    leaverIds: new Set(leaverIds),
    answers:   new Map(),
    finished:  false,
    client,
    timeout:   setTimeout(() => {
      finalizeQuestionnaire(matchId, client).catch((err) =>
        logger.error({ err, matchId }, "Error in questionnaire timeout finalization"),
      );
    }, QUESTIONNAIRE_TIMEOUT_MS),
  };

  pending.set(matchId, state);
  for (const id of participantIds) {
    playerMatchIndex.set(`${id}:match`, matchId);
  }

  // Send DMs to all participants
  for (let i = 0; i < participantIds.length; i++) {
    const discordId = participantIds[i]!;
    await sendQuestionnaireDM(client, matchId, discordId, i + 1, participantIds).catch(
      (err) => logger.warn({ err, discordId }, "Failed to send questionnaire DM"),
    );
  }

  logger.info({ matchId, participants: participantIds.length }, "Questionnaire started");
}

/** Called from index.ts when a player presses the "Responder" button in their DM. */
export async function openQuestionnaireModal(
  interaction: ButtonInteraction,
  matchId:     string,
  discordId:   string,
): Promise<void> {
  const state = pending.get(matchId);
  if (!state || state.finished) {
    await interaction.reply({ content: "Este cuestionario ya ha expirado.", ephemeral: true });
    return;
  }
  if (state.answers.has(discordId)) {
    await interaction.reply({ content: "Ya respondiste el cuestionario.", ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`q_form_${matchId}_${discordId}`)
    .setTitle("🎮 Cuestionario de Partida");

  const auIdInput = new TextInputBuilder()
    .setCustomId("au_id")
    .setLabel("Tu nombre en Among Us")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20);

  const roleInput = new TextInputBuilder()
    .setCustomId("au_role")
    .setLabel("Rol recibido")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Crewmate, Impostor, Engineer, Scientist, Shapeshifter…")
    .setRequired(true)
    .setMaxLength(50);

  const mvpInput = new TextInputBuilder()
    .setCustomId("mvp_vote")
    .setLabel("Número del jugador MVP (ver lista en DM)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("1-15 (deja vacío para no votar)")
    .setRequired(false)
    .setMaxLength(2);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(auIdInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(roleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(mvpInput),
  );

  await interaction.showModal(modal);
}

/** Called from index.ts when the questionnaire modal is submitted. */
export async function recordAnswer(
  interaction: ModalSubmitInteraction,
  matchId:     string,
  discordId:   string,
  client:      Client,
): Promise<void> {
  const state = pending.get(matchId);
  if (!state || state.finished) {
    await interaction.reply({ content: "El cuestionario ya cerró.", ephemeral: true });
    return;
  }
  if (state.answers.has(discordId)) {
    await interaction.reply({ content: "Ya respondiste.", ephemeral: true });
    return;
  }

  const amountUsId  = interaction.fields.getTextInputValue("au_id").trim();
  const roleAmongUs = interaction.fields.getTextInputValue("au_role").trim();
  const mvpRaw      = interaction.fields.getTextInputValue("mvp_vote").trim();

  let mvpVoteIndex: number | null = null;
  if (mvpRaw) {
    const n = parseInt(mvpRaw, 10);
    if (!isNaN(n) && n >= 1 && n <= state.participantIds.length) {
      // Cannot vote for yourself
      const votedId = state.participantIds[n - 1];
      if (votedId !== discordId) {
        mvpVoteIndex = n;
      }
    }
  }

  state.answers.set(discordId, { amountUsId, roleAmongUs, mvpVoteIndex });

  // Persist questionnaire answer to participantes_partida
  await db
    .update(participantesPartidaTable)
    .set({
      roleAmongUs,
      amountUsId,
      questionnaireAnswered: true,
    })
    .where(
      and(
        eq(participantesPartidaTable.partidaId, matchId),
        eq(participantesPartidaTable.discordId, discordId),
      ),
    )
    .catch((err) => logger.warn({ err }, "Failed to persist questionnaire answer"));

  await interaction.reply({ content: "✅ ¡Respuesta registrada! Gracias.", ephemeral: true });

  // Record MVP vote in DB
  if (mvpVoteIndex !== null) {
    const votedId = state.participantIds[mvpVoteIndex - 1]!;
    await db
      .insert(votosMvpTable)
      .values({ partidaId: matchId, votanteId: discordId, votadoId: votedId })
      .onConflictDoNothing()
      .catch((err) => logger.warn({ err }, "Failed to record MVP vote"));
  }

  logger.info({ matchId, discordId, roleAmongUs }, "Questionnaire answer recorded");

  // Check if all participants answered (skip pre-identified leavers)
  const remaining = state.participantIds.filter(
    (id) => !state.answers.has(id) && !state.leaverIds.has(id),
  );
  if (remaining.length === 0) {
    clearTimeout(state.timeout);
    await finalizeQuestionnaire(matchId, client);
  }
}

/** Returns the matchId for a given player's active questionnaire, if any. */
export function getActiveMatchForPlayer(discordId: string): string | null {
  return playerMatchIndex.get(`${discordId}:match`) ?? null;
}

// ── Finalization ───────────────────────────────────────────────────────────

async function finalizeQuestionnaire(matchId: string, client: Client): Promise<void> {
  const state = pending.get(matchId);
  if (!state || state.finished) return;
  state.finished = true;
  clearTimeout(state.timeout);
  pending.delete(matchId);

  logger.info({ matchId }, "Finalizing questionnaire");

  // ── Determine impostors from questionnaire answers ──────────────────────
  const impostorIds: string[] = [];
  for (const [discordId, answer] of state.answers) {
    const role = answer.roleAmongUs.toLowerCase().trim();
    if (IMPOSTOR_ROLES.has(role)) {
      impostorIds.push(discordId);
    }
  }

  // ── Determine final leavers (pre-identified + non-responders) ───────────
  const finalLeavers = new Set(state.leaverIds);
  for (const id of state.participantIds) {
    if (!state.answers.has(id)) finalLeavers.add(id);
  }

  // ── Calculate MVP from votes (ties: all tied players become MVP) ─────────
  const voteMap = new Map<string, number>();
  for (const [, answer] of state.answers) {
    if (answer.mvpVoteIndex !== null) {
      const votedId = state.participantIds[answer.mvpVoteIndex - 1]!;
      voteMap.set(votedId, (voteMap.get(votedId) ?? 0) + 1);
    }
  }

  let mvpIds: string[] = [];
  if (voteMap.size > 0) {
    const maxVotes = Math.max(...voteMap.values());
    mvpIds = [...voteMap.entries()]
      .filter(([, v]) => v === maxVotes)
      .map(([id]) => id);
  }

  // ── Apply leaver ELO penalty (outside atomic tx for now) ─────────────────
  if (finalLeavers.size > 0) {
    await applyLeaverPenalties(matchId, [...finalLeavers], state).catch(
      (err) => logger.warn({ err }, "Leaver penalty application failed — continuing"),
    );
  }

  // ── Close match atomically ───────────────────────────────────────────────
  try {
    await finalizeMatchClose(
      state.lobbyId,
      matchId,
      state.ganador,
      impostorIds,
      [...finalLeavers],
      state.supervisorId,
    );
  } catch (err) {
    logger.error({ err, matchId }, "closeMatchAtomic failed in questionnaire finalization");
    return;
  }

  // ── Update MVP count in season stats ─────────────────────────────────────
  if (mvpIds.length > 0) {
    const season = await seasonRepository.findActive().catch(() => null);
    if (season) {
      for (const mvpId of mvpIds) {
        await db
          .update(estadisticasTemporadaTable)
          .set({ mvpCount: sql`mvp_count + 1` })
          .where(
            and(
              eq(estadisticasTemporadaTable.discordId, mvpId),
              eq(estadisticasTemporadaTable.temporadaId, season.id),
            ),
          )
          .catch((err) => logger.warn({ err, mvpId }, "Failed to update MVP count"));
      }
    }
  }

  // ── Post public results ──────────────────────────────────────────────────
  await postPublicResults(state, impostorIds, mvpIds, [...finalLeavers], client);
}

// ── Private helpers ────────────────────────────────────────────────────────

async function sendQuestionnaireDM(
  client:         Client,
  matchId:        string,
  discordId:      string,
  playerNumber:   number,
  allParticipants: string[],
): Promise<void> {
  const user = await client.users.fetch(discordId);

  // Build numbered player list
  const playerList = allParticipants
    .map((id, i) => `**${i + 1}.** <@${id}>`)
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor("Gold")
    .setTitle("🎮 Cuestionario de Partida")
    .setDescription(
      "La partida ha terminado. Por favor responde en los próximos **15 minutos**.\n\n" +
      "⚠️ **Si no respondes en 15 minutos, serás marcado automáticamente como abandono.**\n\n" +
      "**Jugadores de la partida:**\n" + playerList,
    )
    .setFooter({ text: `Partida ID: ${matchId.slice(0, 8)} • Tú eres el jugador #${playerNumber}` })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`q_open_${matchId}_${discordId}`)
      .setLabel("📝 Responder Cuestionario")
      .setStyle(ButtonStyle.Primary),
  );

  await user.send({ embeds: [embed], components: [row] });
}

async function applyLeaverPenalties(
  matchId:   string,
  leaverIds: string[],
  state:     PendingQuestionnaire,
): Promise<void> {
  const season = await seasonRepository.findActive().catch(() => null);

  for (const discordId of leaverIds) {
    const user        = await userRepository.findByDiscordId(discordId).catch(() => null);
    const eloAnterior = user?.elo ?? DEFAULT_ELO;
    const eloNuevo    = Math.max(0, eloAnterior - ABANDON_ELO_PENALTY);

    // Mark as abandoned in participantes_partida
    await db
      .update(participantesPartidaTable)
      .set({ status: "abandoned" })
      .where(
        and(
          eq(participantesPartidaTable.partidaId, matchId),
          eq(participantesPartidaTable.discordId, discordId),
        ),
      )
      .catch(() => {});

    // Update ELO
    await db
      .update(usuariosTable)
      .set({ elo: eloNuevo, updatedAt: sql`now()` })
      .where(eq(usuariosTable.discordId, discordId))
      .catch(() => {});

    // Historial ELO entry
    if (season) {
      await db
        .insert(historialEloTable)
        .values({
          discordId,
          partidaId:   matchId,
          temporadaId: season.id,
          eloAnterior,
          eloNuevo,
          motivo:      EloMotivo.Abandon,
        })
        .catch(() => {});

      // Increment abandonos in season stats
      await db
        .insert(estadisticasTemporadaTable)
        .values({
          discordId,
          temporadaId:    season.id,
          partidasJugadas: 1,
          victorias:       0,
          derrotas:        0,
          abandonos:       1,
          elo:             eloNuevo,
          mvpCount:        0,
        })
        .onConflictDoUpdate({
          target: [estadisticasTemporadaTable.discordId, estadisticasTemporadaTable.temporadaId],
          set: {
            partidasJugadas: sql`estadisticas_temporada.partidas_jugadas + 1`,
            abandonos:       sql`estadisticas_temporada.abandonos + 1`,
            elo:             eloNuevo,
          },
        })
        .catch(() => {});
    }

    logger.info({ discordId, eloAnterior, eloNuevo }, "Leaver penalty applied");
  }
}

async function postPublicResults(
  state:       PendingQuestionnaire,
  impostorIds: string[],
  mvpIds:      string[],
  leaverIds:   string[],
  client:      Client,
): Promise<void> {
  const supervisionChannelId = await getConfig(ConfigKey.SupervisionChannelId);
  if (!supervisionChannelId) {
    logger.warn("SUPERVISION_CHANNEL_ID not configured — cannot post results");
    return;
  }

  // Load match details for code/map/VC
  const lobby  = await lobbyRepository.findById(state.lobbyId).catch(() => null);
  const partida = await matchRepository.findById(state.matchId).catch(() => null);

  // Build player lines with roles
  const playerLines = await Promise.all(
    state.participantIds.map(async (id, i) => {
      const answer  = state.answers.get(id);
      const isImp   = impostorIds.includes(id);
      const isLeaver = leaverIds.includes(id);
      const role    = answer?.roleAmongUs ?? (isImp ? "Impostor" : "Tripulante");
      const mvpTag  = mvpIds.includes(id) ? " 🏆 **MVP**" : "";
      const leavTag = isLeaver ? " 🚪 *Leaver*" : "";
      return `${i + 1}. <@${id}> — ${role}${mvpTag}${leavTag}`;
    }),
  );

  const ganadorLabel = state.ganador === "TRIPULANTES" ? "🔵 Tripulantes" : "🔴 Impostores";

  const embed = new EmbedBuilder()
    .setColor(state.ganador === "TRIPULANTES" ? "Blue" : "Red")
    .setTitle("🏁 Resultado de la Partida")
    .addFields(
      { name: "Ganador",      value: ganadorLabel,                                         inline: true },
      { name: "Supervisor",   value: `<@${state.supervisorId}>`,                           inline: true },
      { name: "Código",       value: partida?.codigoPartida ?? "—",                        inline: true },
      { name: "Mapa",         value: partida?.mapa ?? "—",                                 inline: true },
      { name: "Partida ID",   value: `\`${state.matchId.slice(0, 8)}\``,                   inline: true },
      { name: "Canal de Voz", value: lobby?.voiceChannelId ? `<#${lobby.voiceChannelId}>` : "—", inline: true },
      { name: `Jugadores (${state.participantIds.length})`, value: playerLines.join("\n"),  inline: false },
    )
    .setTimestamp();

  if (mvpIds.length > 0) {
    embed.addFields({ name: "🏆 MVP", value: mvpIds.map((id) => `<@${id}>`).join(", "), inline: false });
  }
  if (leaverIds.length > 0) {
    embed.addFields({ name: "🚪 Leavers", value: leaverIds.map((id) => `<@${id}>`).join(", "), inline: false });
  }

  // Play Again / Leave buttons
  const playRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`play_again_${state.matchId}`)
      .setLabel("🎮 Jugar de Nuevo")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`leave_match_${state.matchId}`)
      .setLabel("🚪 Salir")
      .setStyle(ButtonStyle.Danger),
  );

  try {
    const guild   = await client.guilds.fetch(state.guildId);
    const channel = guild.channels.cache.get(supervisionChannelId);
    if (!channel?.isTextBased()) {
      logger.warn({ supervisionChannelId }, "Supervision channel not found or not text-based");
      return;
    }
    await (channel as any).send({ embeds: [embed], components: [playRow] });
    logger.info({ matchId: state.matchId }, "Public results posted");
  } catch (err) {
    logger.error({ err, matchId: state.matchId }, "Failed to post public results");
  }
}

export async function handlePlayAgain(
  matchId:   string,
  discordId: string,
  client:    Client,
): Promise<void> {
  // Player stays in VC — nothing to do
  logger.info({ matchId, discordId }, "Player chose to play again");
}

export async function handleLeaveMatch(
  matchId:   string,
  discordId: string,
  client:    Client,
): Promise<void> {
  const lobby = await getMatchLobby(matchId);
  if (!lobby?.guildId || !lobby.voiceChannelId) return;

  const guild = await client.guilds.fetch(lobby.guildId).catch(() => null);
  if (!guild) return;

  await disconnectFromVC(guild, discordId);
  logger.info({ matchId, discordId }, "Player disconnected from Ranked VC after match");
}

async function getMatchLobby(matchId: string) {
  const partida = await matchRepository.findById(matchId).catch(() => null);
  if (!partida?.lobbyId) return null;
  return lobbyRepository.findById(partida.lobbyId).catch(() => null);
}
