---
name: Discord integration token boundary
description: Distinguishes Replit's Discord OAuth connection from the bot credential required by Discord.js gateway services.
---

Replit's Discord connector provides a user OAuth token for identity and guild-level user operations, not a Discord application Bot token for a gateway client or bot-managed channel actions.

**Why:** A Discord.js gateway bot needs the application's Bot token and Discord's `Bot` authorization scheme; substituting the connector's user token leads to authentication or permission failures.

**How to apply:** For Discord bot projects, use the connector when user-scoped API access is needed, but request/store the application's Bot token through Replit Secrets and keep it out of chat and source code.