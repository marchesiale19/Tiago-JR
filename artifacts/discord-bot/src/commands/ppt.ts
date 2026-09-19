import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type Message,
} from "discord.js";
import pkg from "unb-api";
const { Client: UnbClient } = pkg;
import { logger } from "../lib/logger";

const unb = new UnbClient(process.env.UNBELIEVABOAT_API_KEY as string);

const APUESTA_MINIMA = 10000;

export const data = new SlashCommandBuilder()
  .setName("piedrapapeltijera") 
  .setDescription("Juega un 1v1 de Piedra, Papel o Tijera apostando frijoles.")
  .addUserOption((option) =>
    option
      .setName("usuario")
      .setDescription("Usuario al que quieres retar")
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("apuesta")
      .setDescription(`Cantidad a apostar (Mínimo ${APUESTA_MINIMA.toLocaleString()} - Sin límite máximo)`)
      .setMinValue(APUESTA_MINIMA)
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("rondas")
      .setDescription("Cantidad de rondas para ganar (ej: 1, 3, 5)")
      .setMinValue(1)
      .setRequired(true),
  );

async function startPPTChallenge(
  guildId: string,
  challenger: { id: string },
  opponent: { id: string; bot: boolean },
  apuesta: number,
  rondas: number,
  channel: any,
  isSlash: boolean,
  interaction?: ChatInputCommandInteraction
) {
  if (opponent.bot || opponent.id === challenger.id) {
    const content = "❌ No puedes retar a un bot o a ti mismo.";
    if (isSlash && interaction) {
      await interaction.reply({ content, ephemeral: true });
    } else {
      await channel.send({ content });
    }
    return;
  }

  if (apuesta < APUESTA_MINIMA) {
    const content = `❌ La apuesta mínima es de **${APUESTA_MINIMA.toLocaleString()} Frijoles** (sin límite máximo).`;
    if (isSlash && interaction) {
      await interaction.reply({ content, ephemeral: true });
    } else {
      await channel.send({ content });
    }
    return;
  }

  if (isSlash && interaction) {
    await interaction.deferReply();
  }

  try {
    const [balChallenger, balOpponent] = await Promise.all([
      unb.getUserBalance(guildId, challenger.id),
      unb.getUserBalance(guildId, opponent.id),
    ]);

    const cashChallenger = balChallenger.cash || 0;
    const cashOpponent = balOpponent.cash || 0;

    const errorMsg = cashChallenger < apuesta
      ? `❌ No tienes suficientes frijoles para esta apuesta.`
      : cashOpponent < apuesta
      ? `❌ El usuario <@${opponent.id}> no tiene suficientes frijoles para igualar tu apuesta de **${apuesta.toLocaleString()}**.`
      : null;

    if (errorMsg) {
      if (isSlash && interaction) {
        await interaction.editReply({ content: errorMsg });
      } else {
        await channel.send({ content: errorMsg });
      }
      return;
    }

    const embed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle("✊ 📄 ✂️ ¡Duelo de Piedra, Papel o Tijera!")
      .setDescription(`<@${opponent.id}>, has sido retado por <@${challenger.id}>.\n\n💰 **Apuesta en juego:** \`${apuesta.toLocaleString()} Frijoles\`\n🔄 **Rondas para ganar:** \`${rondas}\`\n\n*Al aceptar, se retendrá el pozo inicial de ambos jugadores.*\n⏳ Tienes 10 minutos para aceptar.`);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ppt_accept_${challenger.id}_${opponent.id}_${apuesta}_${rondas}`)
        .setLabel("Aceptar Duelo")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ppt_reject_${challenger.id}_${opponent.id}`)
        .setLabel("Rechazar")
        .setStyle(ButtonStyle.Danger),
    );

    const payload = { content: `<@${opponent.id}>`, embeds: [embed], components: [row] };

    const sentMessage = isSlash && interaction
      ? await interaction.editReply(payload)
      : await channel.send(payload);

    // Creamos un collector para manejar los botones y la expiración de 10 minutos
    const collector = sentMessage.createMessageComponentCollector({
      time: 10 * 60 * 1000, // 10 minutos en milisegundos
    });

    collector.on("collect", async (i: ButtonInteraction) => {
      // Validar que el que hace click sea el oponente o el retador (para rechazar)
      if (i.customId.startsWith("ppt_accept_") || i.customId.startsWith("ppt_reject_")) {
        const parts = i.customId.split("_");
        const targetOpponentId = parts[3];

        if (i.user.id !== targetOpponentId && (i.customId.startsWith("ppt_accept_") || i.user.id !== parts[2])) {
          await i.reply({ content: "❌ No puedes interactuar con este duelo porque no eres el retado.", ephemeral: true });
          return;
        }

        if (i.customId.startsWith("ppt_reject_")) {
          await i.update({
            content: `❌ El duelo fue rechazado por <@${i.user.id}>.`,
            embeds: [],
            components: [],
          });
          collector.stop("rejected");
          return;
        }

        if (i.customId.startsWith("ppt_accept_")) {
          // AQUÍ IMPLEMENTAS LA LÓGICA DE LAS JUGADAS Y EL JUEGO EN SÍ
          await i.reply({ content: "🚀 ¡Has aceptado el duelo! Aquí comenzarán las rondas pronto.", ephemeral: true });
          collector.stop("accepted");
        }
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason === "time") {
        try {
          const expiredEmbed = EmbedBuilder.from(embed)
            .setColor("Gray")
            .setDescription(`⏱️ **Este duelo ha expirado.** Nadie aceptó la invitación en el tiempo límite de 10 minutos.`);

          await sentMessage.edit({
            embeds: [expiredEmbed],
            components: [],
          });
        } catch (err) {
          logger.error({ err }, "Error al expirar el mensaje de PPT");
        }
      }
    });

  } catch (err: any) {
    logger.error({ err }, "Error al iniciar duelo de PPT");
    const errMsg = `❌ Ocurrió un error: ${err?.message}`;
    if (isSlash && interaction) {
      await interaction.editReply({ content: errMsg });
    } else {
      await channel.send({ content: errMsg });
    }
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) return;
  const challenger = interaction.user;
  const opponent = interaction.options.getUser("usuario", true);
  const apuesta = interaction.options.getInteger("apuesta", true);
  const rondas = interaction.options.getInteger("rondas", true);

  await startPPTChallenge(interaction.guildId, challenger, opponent, apuesta, rondas, interaction.channel, true, interaction);
}

export async function run(message: Message, args: string[]): Promise<void> {
  if (!message.guildId) return;

  const opponent = message.mentions.users.first();

  const cleanArgs = args.filter(arg => !arg.includes(opponent?.id ?? ""));
  const apuesta = parseInt(cleanArgs[0], 10);
  const rondas = parseInt(cleanArgs[1], 10);

  if (!opponent || isNaN(apuesta) || isNaN(rondas)) {
    await message.reply("❌ Uso correcto: `-ppt @usuario <apuesta> <rondas>`");
    return;
  }

  await startPPTChallenge(message.guildId, message.author, opponent, apuesta, rondas, message.channel, false);
}

// Ya no necesitas manejarlo de forma global en handleButton si usas el collector aquí mismo, 
// pero si tu manejador global requiere que exista esta función, puedes dejarla vacía o exportarla así:
export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  // Si usas collector local, esto puede quedar vació o como fallback.
}
