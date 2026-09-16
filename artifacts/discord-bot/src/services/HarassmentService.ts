// artifacts/discord-bot/src/services/HarassmentService.ts

import { logger } from "../lib/logger";

interface MentionRecord {
  authorId: string;
  targetId: string;
  timestamp: number;
}

interface HarassmentEvaluation {
  isHarassment: boolean;
  count: number;
  authorId: string;
  targetId: string;
  reasons: string[];
}

export class HarassmentService {
  // Almacén en memoria para las menciones recientes
  private static recentMentions: MentionRecord[] = [];

  // Configuración de la ventana temporal y el umbral
  private static readonly WINDOW_MS = 15 * 60 * 1000; // 15 minutos
  private static readonly MENTION_THRESHOLD = 7; // 7 menciones o más

  /**
   * Registra una mención y evalúa si supera el umbral de hostigamiento.
   */
  public static evaluateMention(authorId: string, targetId: string): HarassmentEvaluation | null {
    // Evitar que se auto-mencione cuente como hostigamiento
    if (authorId === targetId) return null;

    const now = Date.now();

    // Registrar la nueva mención
    this.recentMentions.push({ authorId, targetId, timestamp: now });

    // Limpiar registros antiguos fuera de la ventana de 15 minutos
    this.recentMentions = this.recentMentions.filter(
      (entry) => now - entry.timestamp < this.WINDOW_MS
    );

    // Filtrar las menciones hechas por este autor hacia este mismo objetivo en la ventana actual
    const userMentionsToTarget = this.recentMentions.filter(
      (entry) => entry.authorId === authorId && entry.targetId === targetId
    );

    const count = userMentionsToTarget.length;

    // Si cruza o iguala el umbral, se dispara la alerta
      if (count >= this.MENTION_THRESHOLD) {      // Opcional: limpiar las menciones de este par para evitar spam constante de alertas por cada mensaje extra
      this.recentMentions = this.recentMentions.filter(
        (entry) => !(entry.authorId === authorId && entry.targetId === targetId)
      );

      return {
        isHarassment: true,
        count,
        authorId,
        targetId,
        reasons: [`El usuario ha mencionado a la misma persona ${count} veces en un lapso de 15 minutos o menos.`],
      };
    }

    return null;
  }
}