
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GuildMember,
  Message,
  VoiceChannel,
  VoiceState,
} from "discord.js";

import { randomUUID } from "node:crypto";
import { ANTI_FARM_CONFIG } from "../config/antiFarm.config.js";

interface AntiFarmState {
  guildId: string;
  userId: string;
  channelId: string;
  member: GuildMember;
  token: string;

  watchTimer?: NodeJS.Timeout;
  responseTimer?: NodeJS.Timeout;

  dmMessage?: Message;
  challenged: boolean;
  finalizing: boolean;
}

export class AntiFarmService {
  private readonly states = new Map<string, AntiFarmState>();

  constructor(private readonly client: Client) {}

  private getKey(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  private clearTimers(state: AntiFarmState): void {
    if (state.watchTimer) {
      clearTimeout(state.watchTimer);
      state.watchTimer = undefined;
    }

    if (state.responseTimer) {
      clearTimeout(state.responseTimer);
      state.responseTimer = undefined;
    }
  }

  private removeState(state: AntiFarmState): void {
    this.clearTimers(state);

    const key = this.getKey(state.guildId, state.userId);

    // No eliminar un estado nuevo por una operación antigua.
    if (this.states.get(key) === state) {
      this.states.delete(key);
    }
  }

  private isAlone(channel: VoiceChannel): boolean {
    return channel.members.filter(
      member => !member.user.bot
    ).size === 1;
  }

  private getButtons(
    guildId: string,
    userId: string,
    token: string,
    disabled = false
  ) {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(
          `antifarm:yes:${guildId}:${userId}:${token}`
        )
        .setLabel("Sí")
        .setEmoji("🟩")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),

      new ButtonBuilder()
        .setCustomId(
          `antifarm:no:${guildId}:${userId}:${token}`
        )
        .setLabel("No")
        .setEmoji("🟥")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled)
    );

    return [row];
  }

  /**
   * Inicia la vigilancia de un usuario.
   */
  private startWatching(member: GuildMember): void {
    const channel = member.voice.channel;

    if (
      !channel ||
      !ANTI_FARM_CONFIG.monitoredChannels.has(channel.id) ||
      !this.isAlone(channel)
    ) {
      return;
    }

    const key = this.getKey(member.guild.id, member.id);
    const existing = this.states.get(key);

    // No reiniciar continuamente el mismo temporizador.
    if (
      existing &&
      existing.channelId === channel.id &&
      !existing.finalizing
    ) {
      return;
    }

    if (existing) {
      this.removeState(existing);
    }

    const state: AntiFarmState = {
      guildId: member.guild.id,
      userId: member.id,
      channelId: channel.id,
      member,
      token: randomUUID(),
      challenged: false,
      finalizing: false,
    };

    this.states.set(key, state);

    state.watchTimer = setTimeout(() => {
      void this.sendChallenge(state);
    }, ANTI_FARM_CONFIG.aloneTime);
  }

  /**
   * Envía el mensaje privado después del tiempo de vigilancia.
   */
  private async sendChallenge(state: AntiFarmState): Promise<void> {
    const key = this.getKey(state.guildId, state.userId);

    if (this.states.get(key) !== state || state.finalizing) {
      return;
    }

    state.watchTimer = undefined;

    const channel = state.member.guild.channels.cache.get(
      state.channelId
    );

    if (
      !channel ||
      !channel.isVoiceBased() ||
      !("members" in channel) ||
      !this.isAlone(channel as VoiceChannel) ||
      state.member.voice.channelId !== state.channelId
    ) {
      this.removeState(state);
      return;
    }

    state.challenged = true;

    const embed = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle("¿Estás ahí?")
      .setDescription(
        "Detectamos que estás solo en un canal de Among Us.\n\n" +
        "Para continuar, confirmá que seguís activo.\n\n" +
        "Tenés **2 minutos** para responder."
      )
      .setFooter({
        text: "Sistema Anti-Farmeo"
      });

    try {
      state.dmMessage = await state.member.send({
        embeds: [embed],
        components: this.getButtons(
          state.guildId,
          state.userId,
          state.token
        ),
      });

      state.responseTimer = setTimeout(() => {
        void this.moveToAfk(state);
      }, ANTI_FARM_CONFIG.responseTime);

    } catch (error) {
      console.error(
        `[AntiFarm] No se pudo enviar MD a ${state.userId}:`,
        error
      );

      // No sancionar automáticamente por tener los MD cerrados.
      this.removeState(state);
    }
  }

  /**
   * Traslada al usuario al canal AFK.
   */
  private async moveToAfk(state: AntiFarmState): Promise<void> {
    if (state.finalizing) return;

    const key = this.getKey(state.guildId, state.userId);

    if (this.states.get(key) !== state) return;

    state.finalizing = true;
    this.clearTimers(state);

    try {
      const guild = state.member.guild;
      const afkChannel = guild.afkChannel;

      if (
        afkChannel &&
        state.member.voice.channelId &&
        state.member.voice.channelId !== afkChannel.id
      ) {
        await state.member.voice.setChannel(
          afkChannel,
          "Sistema Anti-Farmeo: usuario sin confirmación"
        );
      }

      if (state.dmMessage) {
        await state.dmMessage.edit({
          content: "⏱️ No recibimos tu confirmación. Se cerró la alerta.",
          components: this.getButtons(
            state.guildId,
            state.userId,
            state.token,
            true
          ),
        }).catch(() => null);
      }

    } catch (error) {
      console.error(
        `[AntiFarm] Error moviendo a ${state.userId}:`,
        error
      );
    } finally {
      this.removeState(state);
    }
  }

  /**
   * Cancela la vigilancia cuando deja de estar solo.
   */
  private cancelWatching(member: GuildMember): void {
    const key = this.getKey(member.guild.id, member.id);
    const state = this.states.get(key);

    if (state) {
      this.removeState(state);
    }
  }

  /**
   * Procesa los cambios de canales de voz.
   */
  private handleVoiceStateUpdate(
    oldState: VoiceState,
    newState: VoiceState
  ): void {
    const member = newState.member ?? oldState.member;

    if (!member || member.user.bot) return;

    const key = this.getKey(member.guild.id, member.id);
    const current = this.states.get(key);

    // Si cambia de canal durante una alerta, se aplica
    // la política de salida anticipada.
    if (
      current?.challenged &&
      newState.channelId !== current.channelId
    ) {
      if (newState.channelId) {
        void this.moveToAfk(current);
      } else {
        this.removeState(current);
      }
    }

    // Reevaluar tanto el canal anterior como el nuevo.
    const channels = new Map<string, VoiceChannel>();

    for (const channel of [oldState.channel, newState.channel]) {
      if (
        channel &&
        channel.isVoiceBased() &&
        ANTI_FARM_CONFIG.monitoredChannels.has(channel.id) &&
        "members" in channel
      ) {
        channels.set(channel.id, channel as VoiceChannel);
      }
    }

    for (const channel of channels.values()) {
      const members = channel.members.filter(
        user => !user.user.bot
      );

      if (members.size === 1) {
        const aloneMember = members.first();

        if (aloneMember) {
          this.startWatching(aloneMember);
        }
      } else {
        for (const channelMember of members.values()) {
          this.cancelWatching(channelMember);
        }
      }
    }

    // Si el usuario salió del canal vigilado y no estaba
    // en una alerta, cancelar su vigilancia anterior.
    if (
      current &&
      !current.challenged &&
      newState.channelId !== current.channelId
    ) {
      this.cancelWatching(member);
    }
  }

  /**
   * Procesa las interacciones de los botones.
   */
  async handleButtonInteraction(
    interaction: ButtonInteraction
  ): Promise<boolean> {
    if (!interaction.customId.startsWith("antifarm:")) {
      return false;
    }

    const [, action, guildId, userId, token] =
      interaction.customId.split(":");

    if (
      !action ||
      !guildId ||
      !userId ||
      !token
    ) {
      return true;
    }

    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: "Esta alerta no te pertenece.",
        ephemeral: true,
      });
      return true;
    }

    const key = this.getKey(guildId, userId);
    const state = this.states.get(key);

    if (
      !state ||
      state.token !== token ||
      !state.challenged ||
      state.finalizing
    ) {
      await interaction.reply({
        content: "Esta alerta ya no está activa.",
        ephemeral: true,
      });
      return true;
    }

    if (action === "yes") {
      this.removeState(state);

      const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle("¡Gracias por confirmar!")
        .setDescription(
          "Confirmamos que seguís activo. La vigilancia se reinició."
        );

      await interaction.update({
        embeds: [embed],
        components: this.getButtons(
          guildId,
          userId,
          token,
          true
        ),
      });

      // Reiniciar el ciclo únicamente si continúa solo.
      const channel = state.member.voice.channel;

      if (
        channel &&
        ANTI_FARM_CONFIG.monitoredChannels.has(channel.id) &&
        this.isAlone(channel)
      ) {
        this.startWatching(state.member);
      }

      return true;
    }

    if (action === "no") {
      await interaction.deferUpdate();

      await this.moveToAfk(state);

      return true;
    }

    return true;
  }

  /**
   * Inicialización del servicio.
   */
  setup(): void {
    this.client.on(
      Events.VoiceStateUpdate,
      (oldState, newState) => {
        this.handleVoiceStateUpdate(oldState, newState);
      }
    );

    console.log("[AntiFarm] Servicio inicializado correctamente.");
  }

  /**
   * Recuperación después de reiniciar el bot.
   */
  recover(): void {
    for (const guild of this.client.guilds.cache.values()) {
      for (const channelId of ANTI_FARM_CONFIG.monitoredChannels) {
        const channel = guild.channels.cache.get(channelId);

        if (!channel?.isVoiceBased() || !("members" in channel)) {
          continue;
        }

        const members = channel.members.filter(
          member => !member.user.bot
        );

        if (members.size === 1) {
          const member = members.first();

          if (member) {
            this.startWatching(member);
          }
        }
      }
    }

    console.log("[AntiFarm] Recuperación de canales completada.");
  }
}
