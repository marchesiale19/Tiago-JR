# Tiagojr Discord Bot

A Discord bot for a gaming community (Spanish-language) with commands for applications, matchmaking queues, lobbies, sanctions, and more.

## Stack

- **Discord bot** — `discord.js` v14, TypeScript, `tsx` watch mode
- **Database** — Replit built-in PostgreSQL via Drizzle ORM
- **API server** — Express 5, TypeScript (optional companion service)
- **Package manager** — pnpm workspaces

## Project structure

```
artifacts/
  discord-bot/   — the bot (main service)
  api-server/    — HTTP API companion
lib/
  db/            — shared Drizzle schema & client (@workspace/db)
  api-zod/       — shared Zod schemas
  api-spec/      — API spec
  api-client-react/ — React API client
```

## Running the bot

The **Discord Bot** workflow runs automatically: `pnpm --filter @workspace/discord-bot run dev`

## Required secrets

| Secret | Where to find it |
|---|---|
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → Your App → **Bot** tab → Token |
| `DISCORD_CLIENT_ID` | Discord Developer Portal → Your App → **General Information** → Application ID |

## Database

Replit's built-in PostgreSQL is used. Schema is managed with Drizzle Kit.

To push schema changes: `pnpm --filter @workspace/db run push`

## Slash commands

Commands auto-register on startup via `registrarComandos()`. Manually re-register with:

```
pnpm --filter @workspace/discord-bot run deploy-commands
```

## User preferences

<!-- Add any preferences here -->
