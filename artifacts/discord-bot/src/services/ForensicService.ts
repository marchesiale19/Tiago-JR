
import { logger } from "../lib/logger";

interface ForensicEvaluation {
  userId: string;
  username: string;
  accountAgeDays: number;
  hasDefaultAvatar: boolean;
  riskScore: number; 
  isSuspiciousCluster: boolean; 
  reasons: string[];
}

interface RecentJoinRecord {
  userId: string;
  timestamp: number;
  accountAgeDays: number;
}

export class ForensicService {
   
  private static recentJoins: RecentJoinRecord[] = [];

  
  private static readonly CLUSTER_WINDOW_MS = 10 * 1000; 
  private static readonly CLUSTER_THRESHOLD = 3;
  
  private static readonly RECENT_ACCOUNT_LIMIT_DAYS = 7; 


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

// 1. Interferencia bayesiana
    const prior = 0.05;
    let likelihoodRatio = 1.0;

    // Condición A: Antigüedad de la cuenta
    if (accountAgeDays < 1) {
      likelihoodRatio *= 15.0; 
      reasons.push("Cuenta creada hace menos de 24 horas");
    } else if (accountAgeDays < 7) {
      likelihoodRatio *= 5.0;  
      reasons.push("Cuenta con menos de una semana de antigüedad");
    } else {
      likelihoodRatio *= 0.2;  
    }

    // Condición B: Avatar por defecto
    if (hasDefaultAvatar) {
      likelihoodRatio *= 3.5;
      reasons.push("Usa el avatar predeterminado de Discord");
    } else {
      likelihoodRatio *= 0.6;
    }

    // Aplicación del teorama de bayes simplificado para odds
    const priorOdds = prior / (1 - prior);
    const posteriorOdds = priorOdds * likelihoodRatio;
    const posteriorProbability = posteriorOdds / (1 + posteriorOdds);

    let riskScore = Math.min(Math.round(posteriorProbability * 100), 100);

    // 2. Huella temporal de conexiones
    
    this.recentJoins.push({ userId, timestamp: now, accountAgeDays });

    this.recentJoins = this.recentJoins.filter(
      (entry) => now - entry.timestamp < this.CLUSTER_WINDOW_MS
    );

    const recentClusterAccounts = this.recentJoins.filter(
      (entry) => entry.accountAgeDays < this.RECENT_ACCOUNT_LIMIT_DAYS
    );

    let isSuspiciousCluster = false;

    if (recentClusterAccounts.length >= this.CLUSTER_THRESHOLD) {
      const isPartOfCluster = recentClusterAccounts.some((entry) => entry.userId === userId);
      
      if (isPartOfCluster) {
        isSuspiciousCluster = true;
        riskScore = Math.min(riskScore + 25, 100); 
        reasons.push(`Forma parte de un ingreso masivo en ráfaga de cuentas recientes (${recentClusterAccounts.length} cuentas en menos de 10 segundos)`);
      }
    }

    logger.info(
      { userId, riskScore, accountAgeDays: Number(accountAgeDays.toFixed(1)), isSuspiciousCluster, clusterSize: recentClusterAccounts.length },
      "Forensic evaluation completed for incoming member with recent-burst check"
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