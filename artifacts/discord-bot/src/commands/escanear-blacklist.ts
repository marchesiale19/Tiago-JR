import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { getBlacklist, checkMemberBlacklist } from '../services/blacklistService';

export const data = new SlashCommandBuilder()
    .setName('escanear-blacklist')
    .setDescription('Escanea a los miembros actuales del servidor en busca de coincidencias con la blacklist.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    if (!guild) {
        await interaction.editReply("Este comando solo se puede usar en un servidor.");
        return;
    }

    const members = await guild.members.fetch();
    const matches: { memberName: string; matchedWith: string }[] = [];

    members.forEach(member => {
        const matched = checkMemberBlacklist(member.id, member.user.username, member.displayName);
        if (matched) {
            matches.push({
                memberName: member.user.tag,
                matchedWith: matched.display_name || matched.username
            });
        }
    });

    if (matches.length === 0) {
        await interaction.editReply("No se encontraron coincidencias de miembros actuales con la blacklist.");
        return;
    }

    const responseList = matches.slice(0, 10).map(m => `- **${m.memberName}** coincide con el registro de \`${m.matchedWith}\``).join('\n');
    const extraText = matches.length > 10 ? `\n*(Y ${matches.length - 10} coincidencias más ocultas)*` : '';

    await interaction.editReply(`Se encontraron ${matches.length} posibles coincidencias:\n${responseList}${extraText}`);
}