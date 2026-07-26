# Discord Bot Project

A Discord bot for competitive gaming — matchmaking, lobbies, sanctions, and ranking — built with discord.js, Express, and PostgreSQL.

## Stack

- **Discord bot** (`artifacts/discord-bot`) — discord.js v14, TypeScript, tsx watch
- **API server** (`artifacts/api-server`) — Express 5, esbuild, pino logging
- **Database** (`lib/db`) — PostgreSQL 16 via Drizzle ORM
- **Shared libs** — `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`

## Commands

| Command | Purpose |
|---|---|
| `/sanciones` | Issue or view player sanctions |
| `/cola` | Join/leave the matchmaking queue |
| `/lobby` | Manage active lobbies |
| `/postular` | Apply for a staff/supervisor role |
| `/abrir-postulaciones` | Open applications (staff) |
| `/cerrar-postulaciones` | Close applications (staff) |
| `/supervisor` | Supervisor management |
| `/help` | Show help |

## Running

The **Discord Bot** workflow runs automatically (`pnpm --filter @workspace/discord-bot run dev`).

The **API Server** workflow also runs automatically (`pnpm --filter @workspace/api-server run dev`).

## Required Secrets

| Key | Where to find it |
|---|---|
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → Bot → Token |
| `DISCORD_CLIENT_ID` | Discord Developer Portal → General Information → Application ID |
| `DATABASE_URL` | Managed automatically by Replit (PostgreSQL 16) |

## Optional Environment Variables

| Key | Default | Purpose |
|---|---|---|
| `STAFF_ROLE_ID` | — | Discord role ID granted to staff; used by `/postular` |
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |

## Database

Schema managed by Drizzle Kit. To push schema changes to the database:

```sh
pnpm --filter @workspace/db run push
```

## User Preferences

_(none yet)_
