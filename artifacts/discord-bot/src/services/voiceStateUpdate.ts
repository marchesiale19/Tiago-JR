import {
  Events,
  type VoiceState,
  type GuildMember,
} from "discord.js";

import { handleAntiFarmVoiceUpdate } from "../services/AntiFarmService";
import { isEligibleVoiceState, updateMemberVoiceProgress } from "../services/missions/mission.voice";

export const event = {
  name: Events.VoiceStateUpdate,

  async execute(oldState: VoiceState, newState: VoiceState) {
    const member = (newState.member ?? oldState.member) as GuildMember | null;

    if (!member || member.user.bot) return;

    // 1. Ejecutamos la lógica del sistema anti-farmeo de Among Us
    handleAntiFarmVoiceUpdate(oldState, newState);

    // 2. Actualizamos el progreso de misiones / voz existente
    await updateMemberVoiceProgress(
      member,
      isEligibleVoiceState(newState),
    );
  },
};
