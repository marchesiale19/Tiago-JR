// ---------------------------------------------------------------------------
// EventBus — centralized typed internal event emitter.
// Services emit and listen here without direct cross-imports.
// Never import from this file inside repository files.
// ---------------------------------------------------------------------------

import { EventEmitter } from "node:events";
import type { Lobby } from "@workspace/db";

// ── Event payload types ────────────────────────────────────────────────────

export interface PlayerJoinedQueuePayload  { discordId: string; lobbyId: string; }
export interface PlayerLeftQueuePayload    { discordId: string; lobbyId: string; }
export interface QueueFullPayload          { lobbyId: string; guildId: string; participantIds: string[]; }
export interface SupervisorNotifiedPayload { lobbyId: string; supervisorId: string; }
export interface SupervisorAcceptedPayload { lobbyId: string; supervisorId: string; }
export interface SupervisorRejectedPayload { lobbyId: string; supervisorId: string; }
export interface SupervisorTimedOutPayload { lobbyId: string; supervisorId: string; }
export interface LobbyReadyPayload         { lobbyId: string; guildId: string; supervisorId: string; participantIds: string[]; }
export interface MatchStartedPayload       { lobbyId: string; matchId: string; }
export interface MatchFinishedPayload      { lobbyId: string; matchId: string; }
export interface LobbyCancelledPayload     { lobbyId: string; supervisorId: string | null; }

// ── Typed event map ────────────────────────────────────────────────────────

export interface BotEvents {
  "player:joined_queue":    [PlayerJoinedQueuePayload];
  "player:left_queue":      [PlayerLeftQueuePayload];
  "queue:full":             [QueueFullPayload];
  "supervisor:notified":    [SupervisorNotifiedPayload];
  "supervisor:accepted":    [SupervisorAcceptedPayload];
  "supervisor:rejected":    [SupervisorRejectedPayload];
  "supervisor:timed_out":   [SupervisorTimedOutPayload];
  "lobby:ready":            [LobbyReadyPayload];
  "match:started":          [MatchStartedPayload];
  "match:finished":         [MatchFinishedPayload];
  "lobby:cancelled":        [LobbyCancelledPayload];
}

// ── Typed emitter wrapper ──────────────────────────────────────────────────

class TypedEventBus extends EventEmitter {
  emit<K extends keyof BotEvents>(event: K, ...args: BotEvents[K]): boolean {
    return super.emit(event as string, ...args);
  }

  on<K extends keyof BotEvents>(
    event: K,
    listener: (...args: BotEvents[K]) => void,
  ): this {
    return super.on(event as string, listener as (...args: any[]) => void);
  }

  once<K extends keyof BotEvents>(
    event: K,
    listener: (...args: BotEvents[K]) => void,
  ): this {
    return super.once(event as string, listener as (...args: any[]) => void);
  }

  off<K extends keyof BotEvents>(
    event: K,
    listener: (...args: BotEvents[K]) => void,
  ): this {
    return super.off(event as string, listener as (...args: any[]) => void);
  }
}

/** Singleton event bus. Import this instance everywhere — do not instantiate new ones. */
export const eventBus = new TypedEventBus();
