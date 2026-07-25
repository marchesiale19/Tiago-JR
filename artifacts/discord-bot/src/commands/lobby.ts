import {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { lobbyRepository } from "../database/repositories/LobbyRepository";
import { LobbyStatus } from "../database/enums";
import { transitionTo, closeLobby } from "../services/LobbyService";
import { setConfig } from "../services/ConfigService";
import { ConfigKey } from "../database/enums";
import { logger } from "../lib/logger";

const ROL_STAFF = "Moderador [PB]";

function hasStaffPermission(member: any): boolean {
  if (!member?.guild?.roles?.cache || !member?.roles?.cache) return false;
  const ref = member.guild.roles.cache.find((r: any) => r.name === ROL_STAFF);
  if (!ref) return false;
  return member.roles.highest.position >= ref.position;
}

function isSupervisorOfLobby(discordId: string, lobby: any): boolean {
  return lobby.supervisorId === discordId;
}

export const data = new SlashCommandBuilder()
  .setName("lobby")
  .setDescription("Comandos de gestión de lobby para supervisores y staff.")
  .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
  .addSubcommand((sub) =>
    sub
      .setName("iniciar")
      .setDescription("Inicia la partida (READY → IN_GAME). Solo supervisor asignado.")
      .addStringOption((opt) =>
        opt.setName("lobby_id").setDescription("ID del lobby").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("finalizar")
      .setDescription("Finaliza la partida (IN_GAME → VALIDATING → CLOSED). Solo supervisor asignado.")
      .addStringOption((opt) =>
        opt.setName("lobby_id").setDescription("ID del lobby").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("cancelar")
      .setDescription("Cancela el lobby desde cualquier estado. Solo staff.")
      .addStringOption((opt) =>
        opt.setName("lobby_id").setDescription("ID del lobby").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("config")
      .setDescription("Actualiza un parámetro de configuración del sistema. Solo staff.")
      .addStringOption((opt) =>
        opt
          .setName("clave")
          .setDescription("Clave de configuración")
          .setRequired(true)
          .addChoices(
            { name: "MAX_PLAYERS",               value: ConfigKey.MaxPlayers },
            { name: "SUPERVISOR_TIMEOUT_SECONDS", value: ConfigKey.SupervisorTimeoutSeconds },
            { name: "CATEGORY_ID",                value: ConfigKey.CategoryId },
            { name: "SUPERVISOR_ROLE_ID",          value: ConfigKey.SupervisorRoleId },
          ),
      )
      .addStringOption((opt) =>
        opt.setName("valor").setDescription("Nuevo valor").setRequired(true),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const sub = interaction.options.getSubcommand();

  if (!interaction.guild) {
    await interaction.editReply("Este comando solo funciona en un servidor.");
    return;
  }

  try {
    if (sub === "iniciar") {
      const lobbyId = interaction.options.getString("lobby_id", true);
      const lobby   = await lobbyRepository.findById(lobbyId);

      if (!lobby) { await interaction.editReply("❌ Lobby no encontrado."); return; }
      if (!isSupervisorOfLobby(interaction.user.id, lobby)) {
        await interaction.editReply("❌ Solo el supervisor asignado puede iniciar la partida."); return;
      }
      if (lobby.status !== LobbyStatus.Ready) {
        await interaction.editReply(`❌ El lobby debe estar en READY para iniciar. Estado actual: \`${lobby.status}\``); return;
      }

      await transitionTo(lobbyId, LobbyStatus.InGame);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Green")
            .setTitle("🎮 ¡Partida iniciada!")
            .setDescription("El lobby ha pasado a IN_GAME.")
            .setTimestamp(),
        ],
      });

    } else if (sub === "finalizar") {
      const lobbyId = interaction.options.getString("lobby_id", true);
      const lobby   = await lobbyRepository.findById(lobbyId);

      if (!lobby) { await interaction.editReply("❌ Lobby no encontrado."); return; }
      if (!isSupervisorOfLobby(interaction.user.id, lobby)) {
        await interaction.editReply("❌ Solo el supervisor asignado puede finalizar la partida."); return;
      }
      if (lobby.status !== LobbyStatus.InGame) {
        await interaction.editReply(`❌ El lobby debe estar en IN_GAME para finalizar. Estado actual: \`${lobby.status}\``); return;
      }

      // IN_GAME → VALIDATING → CLOSED (sequential, no manual validation step for now)
      await transitionTo(lobbyId, LobbyStatus.Validating);
      await closeLobby(lobbyId, LobbyStatus.Closed, interaction.client);

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Blue")
            .setTitle("🏁 Partida finalizada")
            .setDescription("El lobby ha sido cerrado y los canales eliminados.")
            .setTimestamp(),
        ],
      });

    } else if (sub === "cancelar") {
      const lobbyId = interaction.options.getString("lobby_id", true);
      const lobby   = await lobbyRepository.findById(lobbyId);

      if (!lobby) { await interaction.editReply("❌ Lobby no encontrado."); return; }
      if (!hasStaffPermission(interaction.member)) {
        await interaction.editReply("❌ Solo el staff puede cancelar lobbies."); return;
      }
      if ([LobbyStatus.Closed, LobbyStatus.Cancelled].includes(lobby.status as LobbyStatus)) {
        await interaction.editReply("❌ El lobby ya está cerrado o cancelado."); return;
      }

      await closeLobby(lobbyId, LobbyStatus.Cancelled, interaction.client);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setTitle("🚫 Lobby cancelado")
            .setDescription("El lobby ha sido cancelado por el staff.")
            .setTimestamp(),
        ],
      });

    } else if (sub === "config") {
      if (!hasStaffPermission(interaction.member)) {
        await interaction.editReply("❌ Solo el staff puede modificar la configuración."); return;
      }

      const clave = interaction.options.getString("clave", true) as ConfigKey;
      const valor = interaction.options.getString("valor", true);
      await setConfig(clave, valor);

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Green")
            .setTitle("⚙️ Configuración actualizada")
            .addFields(
              { name: "Clave",  value: clave, inline: true },
              { name: "Valor",  value: valor, inline: true },
            )
            .setTimestamp(),
        ],
      });
    }
  } catch (err: any) {
    logger.error({ err, sub }, "Error in /lobby command");
    await interaction.editReply(`❌ Error: ${err?.message ?? "Error desconocido."}`);
  }
}
