import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../database/database";
import { reputacionesTable } from "@workspace/db/schema";

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MIN_MEMBERSHIP_MS = 7 * 24 * 60 * 60 * 1000;

export type TipoReputacion = "positiva" | "negativa";

export class ReputationService {
  static async giveReputation(
    guildId: string,
    giverId: string,
    receiverId: string,
    tipo: TipoReputacion,
    joinedAt: Date | null
  ) {
    if (giverId === receiverId) {
      return {
        success: false,
        message: "❌ No podés darte reputación a vos mismo.",
      };
    }

    if (!joinedAt) {
      return {
        success: false,
        message: "❌ No pude comprobar cuándo entraste al servidor.",
      };
    }

    const membershipTime = Date.now() - joinedAt.getTime();

    if (membershipTime < MIN_MEMBERSHIP_MS) {
      const remaining = MIN_MEMBERSHIP_MS - membershipTime;
      const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));

      return {
        success: false,
        message: `❌ Tenés que llevar al menos 7 días en el servidor para dar reputación. Te faltan aproximadamente ${days} día(s).`,
      };
    }

    const [lastReputation] = await db
      .select()
      .from(reputacionesTable)
      .where(
        and(
          eq(reputacionesTable.guildId, guildId),
          eq(reputacionesTable.giverId, giverId),
          eq(reputacionesTable.receiverId, receiverId)
        )
      )
      .orderBy(desc(reputacionesTable.createdAt))
      .limit(1);

    if (lastReputation) {
      const elapsed = Date.now() - lastReputation.createdAt.getTime();

      if (elapsed < COOLDOWN_MS) {
        const remaining = COOLDOWN_MS - elapsed;
        const hours = Math.floor(remaining / (60 * 60 * 1000));
        const minutes = Math.ceil(
          (remaining % (60 * 60 * 1000)) / (60 * 1000)
        );

        return {
          success: false,
          message: `⏳ Ya le diste reputación a este usuario. Podés volver a hacerlo en ${hours}h ${minutes}min.`,
        };
      }
    }

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
          ? "👍 Reputación positiva registrada."
          : "👎 Reputación negativa registrada.",
    };
  }

  static async getReputation(guildId: string, receiverId: string) {
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
          eq(reputacionesTable.receiverId, receiverId)
        )
      );

    const positivas = Number(result?.positivas ?? 0);
    const negativas = Number(result?.negativas ?? 0);

    return {
      positivas,
      negativas,
      total: positivas - negativas,
    };
  }
}
