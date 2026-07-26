# Discord Bot Project

A pnpm monorepo containing a Discord bot, a REST API server, and shared libraries for a competitive gaming/matchmaking community bot.

## Architecture

- `artifacts/discord-bot` — Discord bot (`@workspace/discord-bot`): slash commands, matchmaking, leaderboards, player profiles, seasons
- `artifacts/api-server` — Express REST API (`@workspace/api-server`): HTTP interface to the database
- `lib/db` — Drizzle ORM schema and migrations (`@workspace/db`)
- `lib/api-zod` — Zod schemas shared between bot and API
- `lib/api-spec` — API specification
- `lib/api-client-react` — React query client for the API

## Running the project

The **Discord Bot** workflow runs automatically: `pnpm --filter @workspace/discord-bot run dev`

The **API Server** workflow also runs: `pnpm --filter @workspace/api-server run dev`

## Required secrets

| Secret | Description |
|---|---|
| `DISCORD_BOT_TOKEN` | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Application ID (already set as env var) |
| `STAFF_ROLE_ID` | Discord role ID for staff/moderators |
| `DATABASE_URL` | Provided automatically by Replit (PostgreSQL) |

## Database

Uses Drizzle ORM with PostgreSQL. To push schema changes:

```
pnpm --filter @workspace/db run push
```

To register slash commands with Discord:

```
pnpm --filter @workspace/discord-bot run deploy-commands
```

## User preferences

- Keep existing monorepo structure and stack
