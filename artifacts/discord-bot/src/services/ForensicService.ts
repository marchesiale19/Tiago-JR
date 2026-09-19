import { logger } from "../lib/logger";

interface ForensicEvaluation {
  userId: string;
  username: string;
  accountAgeDays: number;
  avatarUrl: string | null;
  riskScore: number; 
  isSuspiciousCluster: boolean; 
  reasons: string[];
}

interface RecentJoinRecord {
  userId: string;
  timestamp: number;
  accountAgeDays: number;
  avatarUrl: string | null;
}

export class ForensicService {
   
  private static recentJoins: RecentJoinRecord[] = [];

  private static readonly CLUSTER_WINDOW_MS = 60 * 1000; // Ventana de 1 minuto para comparar avatares y ráfagas
  private static readonly CLUSTER_THRESHOLD = 2;
  private static readonly RECENT_ACCOUNT_LIMIT_DAYS = 7; 

  /**
   * Verifica si una URL de avatar corresponde a los avatares predeterminados/clásicos de Discord.
   */
  private static isDiscordDefaultAvatar(avatarUrl: string | null): boolean {
    if (!avatarUrl) return true;
    // Discord suele incluir patrones como "embed/avatars" o los hashes predeterminados en sus URLs por defecto
    return avatarUrl.includes("embed/avatars") || avatarUrl.includes("/assets/");
  }

  public static evaluateMember(
    userId: string,
    username: string,
    createdAt: Date,
    avatarUrl: string | null
  ): ForensicEvaluation {
    const now = Date.now();
    const accountAgeMs = now - createdAt.getTime();
    const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);

    const reasons: string[] = [];

    // 1. Análisis bayesiano por antigüedad de la cuenta
    const prior = 0.05;
    let likelihoodRatio = 1.0;

    if (accountAgeDays < 1) {
      likelihoodRatio *= 15.0; 
      reasons.push("Cuenta creada hace menos de 24 horas");
    } else if (accountAgeDays < 7) {
      likelihoodRatio *= 5.0;  
      reasons.push("Cuenta con menos de una semana de antigüedad");
    } else {
      likelihoodRatio *= 0.2;  
    }

    // Aplicación del teorema de bayes simplificado
    const priorOdds = prior / (1 - prior);
    const posteriorOdds = priorOdds * likelihoodRatio;
    const posteriorProbability = posteriorOdds / (1 + posteriorOdds);

    let riskScore = Math.min(Math.round(posteriorProbability * 100), 100);

    // 2. Control y limpieza de registros recientes
    this.recentJoins.push({ userId, timestamp: now, accountAgeDays, avatarUrl });

    this.recentJoins = this.recentJoins.filter(
      (entry) => now - entry.timestamp < this.CLUSTER_WINDOW_MS
    );

    const recentClusterAccounts = this.recentJoins.filter(
      (entry) => entry.accountAgeDays < this.RECENT_ACCOUNT_LIMIT_DAYS
    );

    let isSuspiciousCluster = false;

    // 3. Detección de avatares repetidos (excluyendo los predeterminados de Discord)
    const isDefault = this.isDiscordDefaultAvatar(avatarUrl);
    
    if (!isDefault && avatarUrl) {
      // Buscar si otra cuenta reciente entró con exactamente el mismo avatar personalizado
      const matchingAvatarCount = this.recentJoins.filter(
        (entry) => entry.userId !== userId && entry.avatarUrl === avatarUrl
      ).length;

      if (matchingAvatarCount > 0) {
        isSuspiciousCluster = true;
        riskScore = Math.min(riskScore + 40, 100);
        reasons.push(`Comparte el mismo avatar personalizado con otras ${matchingAvatarCount} cuenta(s) recientes`);
      }
    }

    // 4. Detección de ráfagas masivas en ventana de tiempo
    if (recentClusterAccounts.length >= 3) {
      const isPartOfCluster = recentClusterAccounts.some((entry) => entry.userId === userId);
      
      if (isPartOfCluster && !isSuspiciousCluster) {
        isSuspiciousCluster = true;
        riskScore = Math.min(riskScore + 25, 100); 
        reasons.push(`Forma parte de un ingreso masivo en ráfaga de cuentas recientes (${recentClusterAccounts.length} cuentas en poco tiempo)`);
      }
    }

    logger.info(
      { userId, riskScore, accountAgeDays: Number(accountAgeDays.toFixed(1)), isSuspiciousCluster, clusterSize: recentClusterAccounts.length },
      "Forensic evaluation completed with duplicate avatar filter"
    );

    return {
      userId,
      username,
      accountAgeDays: Number(accountAgeDays.toFixed(2)),
      avatarUrl,
      riskScore,
      isSuspiciousCluster,
      reasons,
    };
  }
}
