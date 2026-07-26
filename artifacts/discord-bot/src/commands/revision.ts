import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { staffResolveMatch }   from "../services/MatchService";
import { matchRepository }     from "../database/repositories/MatchRepository";
import type { MatchResultado } from "../services/EloService";
import { logger }              from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("revision")
  .setDescription("Gestiona partidas retenidas pendientes de revisión de staff.")
  .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
  .addSubcommand((sub) =>
    sub
      .setName("lista")
      .setDescription("Lista todas las partidas con requires_revision=true pendientes de resolución."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("resolver")
      .setDescription("Aplica un resultado a una partida retenida (confirmar o modificar resultado).")
      .addStringOption((opt) =>
        opt
          .setName("partida_id")
          .setDescription("ID completo de la partida (cópialo de /revision lista)")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("resultado")
          .setDescription("Resultado a aplicar")
          .setRequired(true)
          .addChoices(
            { name: "🔴 Impostores ganan",  value: "IMPOSTORES"  },
            { name: "🔵 Tripulantes ganan", value: "TRIPULANTES" },
            { name: "⚖️ Empate",            value: "EMPATE"      },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName("decision")
          .setDescription("Tipo de decisión (para registro de auditoría)")
          .setRequired(false)
          .addChoices(
            { name: "Confirmar resultado original", value: "confirm" },
            { name: "Modificar resultado",           value: "modify"  },
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
          .setDescription("Notas de la intervención de staff (quedan en auditoría)")
          .setRequired(false)
          .setMaxLength(500),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("cancelar")
      .setDescription("Cancela una partida retenida sin aplicar ELO ni estadísticas.")
      .addStringOption((opt) =>
        opt
          .setName("partida_id")
          .setDescription("ID completo de la partida (cópialo de /revision lista)")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("notas")
          .setDescription("Motivo de la cancelación (queda en auditoría)")
          .setRequired(false)
          .setMaxLength(500),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  try {
    // ── Lista ──────────────────────────────────────────────────────────────
    if (sub === "lista") {
      const pending = await matchRepository.listPendingRevision();

      if (pending.length === 0) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor("Green")
              .setTitle("✅ Sin partidas pendientes")
              .setDescription("No hay partidas retenidas pendientes de revisión de staff.")
              .setTimestamp(),
          ],
        });
        return;
      }

      const lines = pending.map((p, i) => {
        const ts = Math.floor(p.createdAt.getTime() / 1000);
        return (
          `**${i + 1}.** \`${p.id}\`\n` +
          `Lobby: \`${p.lobbyId ?? "sin lobby"}\` • Creada: <t:${ts}:R>`
        );
      });

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Yellow")
            .setTitle(`⚠️ Partidas pendientes de revisión (${pending.length})`)
            .setDescription(lines.join("\n\n"))
            .setFooter({
              text: "Usa /revision resolver <partida_id> o /revision cancelar <partida_id>",
            })
            .setTimestamp(),
        ],
      });

    // ── Resolver ───────────────────────────────────────────────────────────
    } else if (sub === "resolver") {
      const partidaId = interaction.options.getString("partida_id", true).trim();
      const resultado = interaction.options.getString("resultado", true) as MatchResultado;
      const decision  = (interaction.options.getString("decision") ?? "modify") as "confirm" | "modify";
      const notas     = interaction.options.getString("notas") ?? undefined;

      const impostorIds: string[] = [];
      for (const key of ["impostor1", "impostor2", "impostor3"] as const) {
        const u = interaction.options.getUser(key);
        if (u) impostorIds.push(u.id);
      }

      if (
        (resultado === "IMPOSTORES" || resultado === "TRIPULANTES") &&
        impostorIds.length === 0
      ) {
        await interaction.editReply(
          "❌ Debes especificar al menos **impostor1** para resultados IMPOSTORES o TRIPULANTES.",
        );
        return;
      }

      await staffResolveMatch(partidaId, decision, resultado, impostorIds, interaction.user.id, notas);

      const resultLabel: Record<string, string> = {
        IMPOSTORES:  "🔴 Impostores ganan",
        TRIPULANTES: "🔵 Tripulantes ganan",
        EMPATE:      "⚖️ Empate",
      };

      const decisionLabel = decision === "confirm"
        ? "Confirmación del resultado original"
        : "Modificación del resultado";

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setTitle("✅ Partida resuelta por staff")
        .setDescription("Los cambios de ELO han sido aplicados a todos los participantes.")
        .addFields(
          { name: "Partida ID",  value: `\`${partidaId.slice(0, 8)}\``,           inline: true },
          { name: "Resultado",   value: resultLabel[resultado] ?? resultado,        inline: true },
          { name: "Decisión",    value: decisionLabel,                              inline: true },
          ...(impostorIds.length > 0
            ? [{ name: "Impostores", value: impostorIds.map((id) => `<@${id}>`).join(", "), inline: false }]
            : []),
          ...(notas ? [{ name: "Notas", value: notas, inline: false }] : []),
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    // ── Cancelar ───────────────────────────────────────────────────────────
    } else if (sub === "cancelar") {
      const partidaId = interaction.options.getString("partida_id", true).trim();
      const notas     = interaction.options.getString("notas") ?? undefined;

      await staffResolveMatch(partidaId, "cancel", "CANCELADA", [], interaction.user.id, notas);

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setTitle("❌ Partida cancelada por staff")
            .setDescription(
              "La partida fue cancelada. No se aplicaron cambios de ELO ni estadísticas de temporada.",
            )
            .addFields(
              { name: "Partida ID", value: `\`${partidaId.slice(0, 8)}\``, inline: true },
              ...(notas ? [{ name: "Motivo", value: notas, inline: false }] : []),
            )
            .setTimestamp(),
        ],
      });
    }

  } catch (err) {
    logger.error({ err, sub }, "Error in /revision command");
    const msg = err instanceof Error ? err.message : "Error desconocido.";
    await interaction.editReply(`❌ ${msg}`);
  }
}
