import {
  SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction,
} from "discord.js";
import { lobbyRepository } from "../database/repositories/LobbyRepository";
import { finalizeMatch }   from "../services/MatchService";
import { logger }          from "../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("finalizar")
  .setDescription("Finaliza la partida.")
  .addSubcommand((sub) =>
    sub
      .setName("partida")
      .setDescription("Reporta el resultado y envía el cuestionario a los jugadores. Solo supervisor.")
      .addStringOption((opt) =>
        opt
          .setName("ganador")
          .setDescription("Equipo ganador de la partida")
          .setRequired(true)
          .addChoices(
            { name: "🔵 Tripulantes", value: "TRIPULANTES" },
            { name: "🔴 Impostores",  value: "IMPOSTORES"  },
          ),
      )
      .addUserOption((opt) =>
        opt.setName("leaver1").setDescription("Jugador que abandonó (1)").setRequired(false),
      )
      .addUserOption((opt) =>
        opt.setName("leaver2").setDescription("Jugador que abandonó (2)").setRequired(false),
      )
      .addUserOption((opt) =>
        opt.setName("leaver3").setDescription("Jugador que abandonó (3)").setRequired(false),
      )
      .addUserOption((opt) =>
        opt.setName("leaver4").setDescription("Jugador que abandonó (4)").setRequired(false),
      )
      .addUserOption((opt) =>
        opt.setName("leaver5").setDescription("Jugador que abandonó (5)").setRequired(false),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub !== "partida") return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const ganador = interaction.options.getString("ganador", true) as "TRIPULANTES" | "IMPOSTORES";

    const leaverIds: string[] = [];
    for (const key of ["leaver1", "leaver2", "leaver3", "leaver4", "leaver5"] as const) {
      const u = interaction.options.getUser(key);
      if (u) leaverIds.push(u.id);
    }

    // Find this supervisor's active lobby
    const lobby = await lobbyRepository.findBySupervisorAndStatus(
      interaction.user.id,
      "in_game" as any,
    );

    if (!lobby) {
      await interaction.editReply("❌ No eres el supervisor de ninguna partida en curso.");
      return;
    }

    await finalizeMatch(lobby.id, interaction.user.id, ganador, leaverIds, interaction.client);

    const ganadorLabel = ganador === "TRIPULANTES" ? "🔵 Tripulantes" : "🔴 Impostores";

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("Yellow")
          .setTitle("📋 Cuestionario enviado")
          .setDescription(
            "Los jugadores recibirán un DM con el cuestionario.\n" +
            "Los resultados se publicarán cuando todos respondan o en **15 minutos**.",
          )
          .addFields(
            { name: "Ganador",  value: ganadorLabel,                                      inline: true },
            { name: "Leavers",  value: leaverIds.length > 0 ? leaverIds.map((id) => `<@${id}>`).join(", ") : "Ninguno", inline: true },
          )
          .setTimestamp(),
      ],
    });
  } catch (err: any) {
    logger.error({ err }, "Error in /finalizar partida");
    await interaction.editReply(`❌ ${err?.message ?? "Error desconocido."}`);
  }
}
