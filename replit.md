# Ranked Discord Bot

A full-featured Discord ranked gaming bot built with Discord.js, an Express API server, and PostgreSQL (via Drizzle ORM).

## Stack

- **Discord bot** — `artifacts/discord-bot` — Discord.js 14, TypeScript, tsx
- **API server** — `artifacts/api-server` — Express 5, TypeScript, esbuild
- **Database** — `lib/db` — PostgreSQL + Drizzle ORM
- **Shared libs** — `lib/api-zod`, `lib/api-spec`, `lib/api-client-react`
- **Package manager** — pnpm workspace

## Features

- Matchmaking queue (`/buscar-partida`, `/cancelar`)
- Match lifecycle (`/abrir`, `/cerrar`, `/registrar-partida`, `/finalizar-partida`)
- Player profiles (`/perfil`)
- Rankings and seasons (`/ranking`, `/temporada`)
- Achievements (`/logros`)
- Sanctions (`/sanciones`)
- Staff tools (`/emparejamiento`, `/supervisor-inactivo`)
- Help menu (`/help`)

## Running

Install the workspace dependencies once after importing:

```
pnpm install --frozen-lockfile
```

The **Discord Bot** run button starts the bot. The API server and component
preview server run through their own managed workflows.

The **Discord Bot** workflow runs the bot:

```
pnpm --filter @workspace/discord-bot run dev
```

The **API Server** workflow runs the REST API:

```
pnpm --filter @workspace/api-server run dev
```

The API health check is available at `/api/healthz` and should return
`{"status":"ok"}` when the server is ready.

## Required Secrets

| Secret | Description |
|---|---|
| `DISCORD_BOT_TOKEN` | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Bot application ID (set as env var) |
| `DATABASE_URL` | PostgreSQL connection string (auto-provided by Replit) |

## Database

The development PostgreSQL database is provisioned automatically by Replit.
Initialize the imported schema with:

```
pnpm --filter @workspace/db run push
```

To push schema changes:

```
pnpm --filter @workspace/db run push
```

To generate a new migration:

```
pnpm --filter @workspace/db run generate
```

## Registering Slash Commands

Commands are registered automatically on bot startup. To register manually:

```
pnpm --filter @workspace/discord-bot run deploy-commands
```

## User Preferences

- Keep the existing project structure — do not restructure or migrate the monorepo layout.
