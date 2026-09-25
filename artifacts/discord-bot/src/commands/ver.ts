import {
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import { ReputationService } from "../services/ReputationService";

export const data = new SlashCommandBuilder()
  .setName("ver")
  .setDescription("Consulta información de un usuario.")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("rep")
      .setDescription("Consulta la reputación de un usuario.")
      .addUserOption((option) =>
        option
          .setName("usuario")
          .setDescription("Usuario cuya reputación quieres consultar")
          .setRequired(true),
      ),
  );

async function showReputation(
  guildId: string,
  targetId: string,
  targetName: string,
  reply: (payload: any) => Promise<any>,
): Promise<void> {
  const reputation = await ReputationService.getReputation(
    guildId,
    targetId,
  );

  const embed = new EmbedBuilder()
    .setColor(
      reputation.total > 0
        ? "Green"
        : reputation.total < 0
          ? "Red"
          : "Blue",
    )
    .setTitle(`⭐ Reputación de ${targetName}`)
    .setDescription(
      `**Reputación registrada**\n\n` +
      `👍 Positivas: **${reputation.positivas}**\n` +
      `👎 Negativas: **${reputation.negativas}**\n` +
      `📊 Balance: **${reputation.total >= 0 ? "+" : ""}${reputation.total}**`,
    );

  await reply({
    embeds: [embed],
  });
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId) return;

  const target = interaction.options.getUser("usuario", true);

  await showReputation(
    interaction.guildId,
    target.id,
    target.username,
    async (payload) => {
      await interaction.reply(payload);
    },
  );
}

export async function run(
  message: Message,
  args: string[],
): Promise<void> {
  if (!message.guildId) return;

  if (args[0]?.toLowerCase() !== "rep") {
    await message.reply(
      "❌ Uso correcto: `-ver rep @usuario`",
    );
    return;
  }

  const target = message.mentions.users.first();

  if (!target) {
    await message.reply(
      "❌ Uso correcto: `-ver rep @usuario`",
    );
    return;
  }

  if (target.bot) {
    await message.reply(
      "❌ No puedes consultar la reputación de un bot.",
    );
    return;
  }

  await showReputation(
    message.guildId,
    target.id,
    target.username,
    async (payload) => {
      await message.reply(payload);
    },
  );
}
