// ---------------------------------------------------------------------------
// AchievementNotificationService — Discord delivery layer for achievement
// unlock notifications.
//
// Architecture:
//   AchievementService          → evaluation + persistence (no Discord)
//   AchievementNotificationService → formatting + Discord DM delivery only
//
// Rules enforced by this layer:
//   • No database queries — all data must arrive via the `newlyUnlocked`
//     parameter populated by AchievementService.
//   • Every delivery attempt is individually try/caught; a DM failure
//     (closed DMs, rate limit, unknown user) is logged and silently skipped.
//   • This service is intentionally stateless — instantiate once and reuse.
// ---------------------------------------------------------------------------

import { EmbedBuilder, type Client } from "discord.js";
import type { Logro } from "@workspace/db";
import { logger } from "../lib/logger";
import type { NewlyUnlockedAchievement } from "./AchievementService";

export type { NewlyUnlockedAchievement };

export class AchievementNotificationService {
  /**
   * Send a DM to each player who unlocked at least one achievement in this
   * batch. One embed per unlock is sent; failures are isolated per-player
   * per-achievement and never propagate to the caller.
   *
   * @param client        The logged-in Discord.js Client.
   * @param newlyUnlocked List produced by AchievementService.evaluateAndUnlockForPlayers.
   */
  async notifyPlayers(
    client:        Client,
    newlyUnlocked: NewlyUnlockedAchievement[],
  ): Promise<void> {
    if (newlyUnlocked.length === 0) return;

    for (const { discordId, achievement } of newlyUnlocked) {
      try {
        const user = await client.users.fetch(discordId);
        await user.send({ embeds: [this.buildEmbed(achievement)] });
        logger.info(
          { discordId, achievementId: achievement.id, codigo: achievement.codigo },
          "Achievement unlock DM sent",
        );
      } catch (err) {
        // DMs may be disabled, the user may have left, or Discord may be
        // temporarily unavailable. Log and continue — never throw.
        logger.warn(
          { err, discordId, achievementId: achievement.id, codigo: achievement.codigo },
          "Could not send achievement unlock DM — continuing",
        );
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Build the notification embed for a single unlocked achievement.
   * Uses only data from the `Logro` catalog object — no DB queries.
   */
  private buildEmbed(achievement: Logro): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0xffd700) // Gold
      .setTitle("🏆 ¡Nuevo Logro Desbloqueado!")
      .setDescription(
        `**${achievement.nombre}**\n${achievement.descripcion}`,
      )
      .addFields(
        { name: "Código", value: `\`${achievement.codigo}\``, inline: true },
      )
      .setFooter({ text: "¡Sigue así para desbloquear más logros!" })
      .setTimestamp();
  }
}

export const achievementNotificationService = new AchievementNotificationService();
