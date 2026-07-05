---
name: Bot loses access to channels it makes private
description: Denying @everyone ViewChannel on a channel also blocks the bot itself unless it has an explicit allow overwrite or Administrator.
---

When a bot programmatically sets up a private channel (e.g. denying `ViewChannel` for `@everyone` and allowing a specific staff role), it must also add an explicit permission overwrite granting itself (`client.user.id`) `ViewChannel`/`SendMessages`/`ManageChannels`/`ManageRoles` on that channel — unless the bot's role has server-wide Administrator.

**Why:** Without Administrator, a bot is subject to the same overwrite resolution as any other member. Denying `@everyone` ViewChannel with no bot-specific allow overwrite blocks the bot too. This doesn't fail on channel creation — it fails later, on the *next* fetch/edit/send call to that channel, with `DiscordAPIError[50001]: Missing Access` (distinct from `50013 Missing Permissions`, which is a missing-guild-permission error). The delayed failure mode makes it easy to misdiagnose as a stale-cache or wrong-guild bug.

**How to apply:** Any time you build/edit permission overwrites for a bot-managed private channel, always include a bot self-overwrite alongside the `@everyone` deny and any role allows — set it first, before applying the `@everyone` deny.
