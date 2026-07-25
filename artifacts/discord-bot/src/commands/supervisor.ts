import {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { setAvailable, setUnavailable }    from "../services/SupervisorService";
import { startMatch, submitResult }        from "../services/MatchService";
import { lobbyRepository }                 from "../database/repositories/LobbyRepository";
import { supervisorRepository }            from "../database/repositories/SupervisorRepository";
import { LobbyStatus }                     from "../database/enums";
import type { MatchResultado }             from "../services/EloService";
import { logger }                          from "../lib/logger";

// Require the Discord-native MuteMembers permission to see this command —
// matches the role matrix for Trial Helper and above.
export const data = new SlashCommandBuilder()
  .setName("supervisor")
  .setDescription("Gestiona tu disponibilidad y partidas como supervisor.")
  .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
  .addSubcommand((sub) =>
    sub.setName("disponible").setDescription("Márcate como disponible para supervisar partidas."),
  )
  .addSubcommand((sub) =>
    sub.setName("ocupado").setDescription("Márcate como no disponible para supervisar partidas."),
  )
  .addSubcommand((sub) =>
    sub.setName("estado").setDescription("Muestra tu estado actual de disponibilidad."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("start")
      .setDescription("Inicia la partida del lobby que tienes asignado (READY → IN_GAME)."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("result")
      .setDescription("Reporta el resultado de tu partida activa (IN_GAME → CLOSED).")
      .addStringOption((opt) =>
        opt
          .setName("resultado")
          .setDescription("Resultado de la partida")
          .setRequired(true)
          .addChoices(
            { name: "🔴 Impostores ganan",  value: "IMPOSTORES"  },
            { name: "🔵 Tripulantes ganan", value: "TRIPULANTES" },
            { name: "⚖️ Empate",            value: "EMPATE"      },
            { name: "❌ Cancelada",         value: "CANCELADA"   },
          ),
      )
      .addUserOption((opt) =>
        opt.setName("impostor1").setDescription("Jugador impostor 1").setRequired(false),
      )
      .addUserOption((opt) =>
        opt.setName("impostor2").setDescription("Jugador impostor 2").setRequired(false),
      )
      .addUserOption((opt) =>
        opt.setName("impostor3").setDescription("Jugador impostor 3").setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName("notas")
          .setDescription("Notas opcionales (se registrarán como reporte de resultado)")
          .setRequired(false)
          .setMaxLength(500),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  try {
    // ── Availability management ──────────────────────────────────────────

    if (sub === "disponible") {
      await setAvailable(interaction.user.id);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Green")
            .setTitle("✅ Ahora estás disponible")
            .setDescription("Serás asignado a la próxima partida disponible según orden FIFO.")
            .setTimestamp(),
        ],
      });

    } else if (sub === "ocupado") {
      await setUnavailable(interaction.user.id);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setTitle("🔴 Ahora estás no disponible")
            .setDescription("No recibirás solicitudes de supervisión hasta que te marques como disponible.")
            .setTimestamp(),
        ],
      });

    } else if (sub === "estado") {
      const row = await supervisorRepository.findByDiscordId(interaction.user.id);
      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setTitle("📊 Tu estado de supervisor")
        .setTimestamp();

      if (!row) {
        embed.setDescription("No tienes ningún registro de supervisor aún. Usa `/supervisor disponible` para registrarte.");
      } else {
        embed.addFields(
          { name: "Disponible",    value: row.disponible ? "✅ Sí" : "❌ No", inline: true },
          { name: "Ocupado",       value: row.ocupado    ? "🔴 Sí" : "✅ No", inline: true },
          { name: "Último cambio", value: `<t:${Math.floor(row.ultimoCambio.getTime() / 1000)}:R>`, inline: false },
        );
      }

      await interaction.editReply({ embeds: [embed] });

    // ── Phase 3: Start match ─────────────────────────────────────────────

    } else if (sub === "start") {
      // Find the READY lobby assigned to this supervisor
      const lobby = await lobbyRepository.findBySupervisorAndStatus(
        interaction.user.id,
        LobbyStatus.Ready,
      );

      if (!lobby) {
        await interaction.editReply(
          "❌ No tienes ningún lobby en estado **READY** asignado a ti. " +
          "Acepta primero la solicitud de supervisión.",
        );
        return;
      }

      const partida = await startMatch(lobby.id, interaction.client);

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Orange")
            .setTitle("⚔️ ¡Partida iniciada!")
            .setDescription(
              "La partida ha comenzado. Usa `/supervisor result` cuando finalice.",
            )
            .addFields(
              { name: "Lobby ID",  value: lobby.id.slice(0, 8),   inline: true },
              { name: "Match ID",  value: partida.id.slice(0, 8), inline: true },
            )
            .setTimestamp(),
        ],
      });

    // ── Phase 3: Report result ───────────────────────────────────────────

    } else if (sub === "result") {
      const resultado = interaction.options.getString("resultado", true) as MatchResultado;

      // Find the IN_GAME lobby assigned to this supervisor
      const lobby = await lobbyRepository.findBySupervisorAndStatus(
        interaction.user.id,
        LobbyStatus.InGame,
      );

      if (!lobby) {
        await interaction.editReply(
          "❌ No tienes ningún lobby en estado **IN_GAME** asignado a ti. " +
          "Inicia la partida primero con `/supervisor start`.",
        );
        return;
      }

      // Collect named impostors from user options
      const impostorIds: string[] = [];
      for (const key of ["impostor1", "impostor2", "impostor3"] as const) {
        const u = interaction.options.getUser(key);
        if (u) impostorIds.push(u.id);
      }

      // Require at least one impostor for competitive outcomes
      if (
        (resultado === "IMPOSTORES" || resultado === "TRIPULANTES") &&
        impostorIds.length === 0
      ) {
        await interaction.editReply(
          "❌ Debes especificar al menos **impostor1** para resultados de IMPOSTORES o TRIPULANTES.",
        );
        return;
      }

      const notas = interaction.options.getString("notas") ?? undefined;

      const output = await submitResult(
        lobby.id,
        resultado,
        impostorIds,
        interaction.user.id,
        notas,
      );

      if (output.requiresRevision) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor("Yellow")
              .setTitle("⚠️ Resultado registrado — pendiente de revisión")
              .setDescription(
                "Esta partida tiene una **bandera de revisión** activa (posible incidente de recuperación). " +
                "El staff debe revisarla manualmente antes de cerrarla.",
              )
              .addFields(
                { name: "Match ID",  value: output.matchId.slice(0, 8), inline: true },
                { name: "Resultado", value: resultado,                   inline: true },
                { name: "Estado",    value: "VALIDATING",               inline: true },
              )
              .setTimestamp(),
          ],
        });
      } else {
        const resultLabel: Record<MatchResultado, string> = {
          IMPOSTORES:  "🔴 Impostores ganan",
          TRIPULANTES: "🔵 Tripulantes ganan",
          EMPATE:      "⚖️ Empate",
          CANCELADA:   "❌ Cancelada",
        };

        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(resultado === "CANCELADA" ? "Red" : "Green")
              .setTitle("🏁 Partida cerrada")
              .setDescription(
                resultado === "CANCELADA"
                  ? "La partida fue cancelada. No se aplicaron cambios de ELO."
                  : resultado === "EMPATE"
                  ? "Empate registrado. No se aplicaron cambios de ELO."
                  : "Los cambios de ELO han sido aplicados a todos los participantes.",
              )
              .addFields(
                { name: "Resultado", value: resultLabel[resultado], inline: true },
                { name: "Match ID",  value: output.matchId.slice(0, 8), inline: true },
                ...(impostorIds.length > 0
                  ? [{ name: "Impostores", value: impostorIds.map((id) => `<@${id}>`).join(", "), inline: false }]
                  : []),
              )
              .setTimestamp(),
          ],
        });
      }
    }

  } catch (err) {
    logger.error({ err, sub }, "Error in /supervisor command");
    const msg = err instanceof Error ? err.message : "Error desconocido.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(`❌ ${msg}`);
    }
  }
}
