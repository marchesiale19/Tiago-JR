
import type { Client, VoiceState } from "discord.js";

export function setupVoiceRewards(client: Client) {
  client.on(
    "voiceStateUpdate",
    (oldState: VoiceState, newState: VoiceState) => {
      if (newState.member?.user.bot ?? oldState.member?.user.bot) {
        return;
      }

      if (oldState.channelId === newState.channelId) {
        return;
      }

      console.log(
        `[VOICE] ${newState.id}: ${
          oldState.channelId ?? "desconectado"
        } -> ${newState.channelId ?? "desconectado"}`,
      );
    },
  );
}
