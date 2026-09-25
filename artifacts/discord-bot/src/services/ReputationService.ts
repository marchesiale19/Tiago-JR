import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../database/database";
import { reputacionesTable } from "@workspace/db/schema";

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MIN_MEMBERSHIP_MS = 7 * 24 * 60 * 60 * 1000;

export type TipoReputacion = "positiva" | "negativa";

interface ReputationResult {
  success: boolean;
  message: string;
}

export class ReputationService {
  /**
   * Registra una reputación.
   *
   * Reglas:
   * - No se permite auto-reputación.
   * - El usuario debe llevar al menos 7 días en el servidor.
   * - Solo puede calificar al mismo usuario una vez cada 24 horas.
   * - La reputación queda asociada al servidor.
   */
  static async giveReputation(
    guildId: string,
    giverId: string,
    receiverId: string,
    tipo: TipoReputacion,
    joinedAt: Date | null,
  ): Promise<ReputationResult> {
    // ─────────────────────────────────────────────
    // VALIDACIONES BÁSICAS
    // ─────────────────────────────────────────────

    if (!guildId) {
      return {
        success: false,
        message: "❌ No se pudo identificar el servidor.",
      };
    }

    if (!giverId || !receiverId) {
      return {
        success: false,
        message: "❌ No se pudieron identificar los usuarios.",
      };
    }

    if (giverId === receiverId) {
      return {
        success: false,
        message: "❌ No podés darte reputación a vos mismo.",
      };
    }

    if (tipo !== "positiva" && tipo !== "negativa") {
      return {
        success: false,
        message: "❌ El tipo de reputación no es válido.",
      };
    }

    // ─────────────────────────────────────────────
    // ANTIGÜEDAD EN EL SERVIDOR
    // ─────────────────────────────────────────────

    if (!joinedAt) {
      return {
        success: false,
        message:
          "❌ No pude comprobar cuándo entraste al servidor.",
      };
    }

    const now = Date.now();
    const membershipTime = now - joinedAt.getTime();

    if (membershipTime < MIN_MEMBERSHIP_MS) {
      const remainingMs =
        MIN_MEMBERSHIP_MS - membershipTime;

      const remainingDays = Math.ceil(
        remainingMs / (24 * 60 * 60 * 1000),
      );

      return {
        success: false,
        message:
          `❌ Tenés que llevar al menos 7 días en el servidor para dar reputación. ` +
          `Te faltan aproximadamente ${remainingDays} día(s).`,
      };
    }

    // ─────────────────────────────────────────────
    // COOLDOWN DE 24 HORAS
    // ─────────────────────────────────────────────

    const [lastReputation] = await db
      .select({
        createdAt: reputacionesTable.createdAt,
      })
      .from(reputacionesTable)
      .where(
        and(
          eq(reputacionesTable.guildId, guildId),
          eq(reputacionesTable.giverId, giverId),
          eq(reputacionesTable.receiverId, receiverId),
        ),
      )
      .orderBy(desc(reputacionesTable.createdAt))
      .limit(1);

    if (lastReputation?.createdAt) {
      const elapsed =
        now - lastReputation.createdAt.getTime();

      if (elapsed < COOLDOWN_MS) {
        const remainingMs =
          COOLDOWN_MS - elapsed;

        const remainingHours = Math.floor(
          remainingMs / (60 * 60 * 1000),
        );

        const remainingMinutes = Math.ceil(
          (remainingMs % (60 * 60 * 1000)) /
            (60 * 1000),
        );

        let timeText = "";

        if (remainingHours > 0) {
          timeText += `${remainingHours}h`;
        }

        if (remainingMinutes > 0) {
          timeText +=
            `${timeText ? " " : ""}${remainingMinutes}min`;
        }

        return {
          success: false,
          message:
            `⏳ Ya le diste reputación a este usuario. ` +
            `Podés volver a hacerlo en ${timeText}.`,
        };
      }
    }

    // ─────────────────────────────────────────────
    // GUARDAR REPUTACIÓN
    // ─────────────────────────────────────────────

    await db.insert(reputacionesTable).values({
      guildId,
      giverId,
      receiverId,
      tipo,
    });

    return {
      success: true,
      message:
        tipo === "positiva"
          ? "👍 Reputación positiva registrada correctamente."
          : "👎 Reputación negativa registrada correctamente.",
    };
  }

  /**
   * Obtiene la reputación de un usuario dentro de un servidor.
   *
   * La reputación está separada por guild:
   * una reputación obtenida en Server A no aparece
   * automáticamente en Server B.
   */
  static async getReputation(
    guildId: string,
    receiverId: string,
  ) {
    const [result] = await db
      .select({
        positivas: sql<number>`
          count(*) filter (
            where ${reputacionesTable.tipo} = 'positiva'
          )
        `,
        negativas: sql<number>`
          count(*) filter (
            where ${reputacionesTable.tipo} = 'negativa'
          )
        `,
      })
      .from(reputacionesTable)
      .where(
        and(
          eq(reputacionesTable.guildId, guildId),
          eq(reputacionesTable.receiverId, receiverId),
        ),
      );

    const positivas = Number(
      result?.positivas ?? 0,
    );

    const negativas = Number(
      result?.negativas ?? 0,
    );

    return {
      positivas,
      negativas,
      total: positivas - negativas,
    };
  }
}
