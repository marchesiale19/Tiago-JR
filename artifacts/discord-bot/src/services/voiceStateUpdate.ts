import {
  Events,
  type VoiceState,
  type GuildMember,
} from "discord.js";

import { isEligibleVoiceState, updateMemberVoiceProgress } from "../services/missions/mission.voice";

export const event = {
  name: Events.VoiceStateUpdate,

async execute(oldState: VoiceState, newState: VoiceState) {
    const member = (newState.member ?? oldState.member) as GuildMember | null;

    if (!member || member.user.bot) return;

// Cerramos el intervalo anterior y, si corresponde,
    // iniciamos uno nuevo según el estado actual.
    await updateMemberVoiceProgress(
      member,
      isEligibleVoiceState(newState),
    );
  },
};
