import { Events, type Client } from "discord.js";

export function setupVoiceRewards(client: Client): void {
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    const userId = newState.id;
    const guildId = newState.guild.id;

    // Ignorar bots.
    if (newState.member?.user.bot) return;

    // Detectar entrada, salida o cambio de canal.
    if (oldState.channelId === newState.channelId) return;

    if (!oldState.channelId && newState.channelId) {
      console.log(`[VoiceRewards] ${userId} entró a voz en ${guildId}.`);
      return;
    }

    if (oldState.channelId && !newState.channelId) {
      console.log(`[VoiceRewards] ${userId} salió de voz en ${guildId}.`);
      return;
    }

    if (oldState.channelId && newState.channelId) {
      console.log(`[VoiceRewards] ${userId} cambió de canal en ${guildId}.`);
    }
  });
}
