// artifacts/discord-bot/src/services/ForensicService.ts

import { logger } from "../lib/logger";

interface ForensicEvaluation {
  userId: string;
  username: string;
  accountAgeDays: number;
  hasDefaultAvatar: boolean;
  riskScore: number; // Porcentaje de probabilidad (0 a 100)
  isSuspiciousCluster: boolean; // Detectado por huella temporal
  reasons: string[];
}

export class ForensicService {
  // Almacén en memoria para la huella temporal de conexiones
  private static recentJoins: { userId: string; timestamp: number }[] = [];

  // Parámetro de ventana temporal actualizado a 10 segundos según pedido de Xandel
  private static readonly CLUSTER_WINDOW_MS = 10 * 1000; 
  private static readonly CLUSTER_THRESHOLD = 3; // 3 o más cuentas en el mismo margen

  /**
   * Evalúa a un miembro nuevo utilizando Inferencia Bayesiana y huella temporal.
   */
  public static evaluateMember(
    userId: string,
    username: string,
    createdAt: Date,
    hasDefaultAvatar: boolean
  ): ForensicEvaluation {
    const now = Date.now();
    const accountAgeMs = now - createdAt.getTime();
    const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);

    const reasons: string[] = [];

    // ── 1. Inferencia Bayesiana (Evaluación de Riesgo) ───────────────────
    // Probabilidad Base (Prior): 5% (0.05)
    const prior = 0.05;
    let likelihoodRatio = 1.0;

    // Condición A: Antigüedad de la cuenta
    if (accountAgeDays < 1) {
      likelihoodRatio *= 15.0; // Cuenta creada hace menos de 24 horas
      reasons.push("Cuenta creada hace menos de 24 horas");
    } else if (accountAgeDays < 7) {
      likelihoodRatio *= 5.0;  // Cuenta creada hace menos de una semana
      reasons.push("Cuenta con menos de una semana de antigüedad");
    } else {
      likelihoodRatio *= 0.2;  // Cuenta antigua reduce drásticamente la sospecha
    }

    // Condición B: Avatar por defecto
    if (hasDefaultAvatar) {
      likelihoodRatio *= 3.5;
      reasons.push("Usa el avatar predeterminado de Discord");
    } else {
      likelihoodRatio *= 0.6;
    }

    // Aplicación del Teorema de Bayes simplificado para odds
    const priorOdds = prior / (1 - prior);
    const posteriorOdds = priorOdds * likelihoodRatio;
    const posteriorProbability = posteriorOdds / (1 + posteriorOdds);

    // Convertir a porcentaje (0 a 100)
    let riskScore = Math.min(Math.round(posteriorProbability * 100), 100);

    // ── 2. Huella Temporal de Conexiones (Detección de Alts en ráfaga de 10s) ─────
    this.recentJoins.push({ userId, timestamp: now });

    // Limpiar registros viejos fuera de la ventana de 10 segundos
    this.recentJoins = this.recentJoins.filter(
      (entry) => now - entry.timestamp < this.CLUSTER_WINDOW_MS
    );

    // Verificar si hay un cúmulo inusual de cuentas entrando juntas en segundos
    const recentCount = this.recentJoins.length;
    let isSuspiciousCluster = false;

    if (recentCount >= this.CLUSTER_THRESHOLD) {
      isSuspiciousCluster = true;
      riskScore = Math.min(riskScore + 25, 100); // Bonificador de riesgo por racimo
      reasons.push(`Forma parte de un ingreso masivo en ráfaga (${recentCount} cuentas en menos de 10 segundos)`);
    }

    logger.info(
      { userId, riskScore, accountAgeDays: Number(accountAgeDays.toFixed(1)), isSuspiciousCluster },
      "Forensic evaluation completed for incoming member"
    );

    return {
      userId,
      username,
      accountAgeDays: Number(accountAgeDays.toFixed(2)),
      hasDefaultAvatar,
      riskScore,
      isSuspiciousCluster,
      reasons,
    };
  }
}