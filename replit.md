# Discord Bot Project

A pnpm monorepo for a competitive gaming/matchmaking Discord bot with ELO ratings, seasons, achievements, player profiles, match lobbies, and moderation tools.

## Architecture

| Package | Description |
|---|---|
| `artifacts/discord-bot` | Discord bot — slash commands, services (ELO, matchmaking, seasons, achievements) |
| `artifacts/api-server` | Express REST API — HTTP interface to the shared database |
| `lib/db` | Drizzle ORM schema + PostgreSQL connection (`@workspace/db`) |
| `lib/api-zod` | Zod schemas shared between the bot and API server |
| `lib/api-spec` | OpenAPI-style API specification |
| `lib/api-client-react` | React Query hooks for the API (for future web frontends) |
| `scripts` | Utility scripts including the setup helper |

## First-time setup on Replit

1. **Add secrets** — go to *Secrets* and add:
   - `DISCORD_BOT_TOKEN` — from the Discord Developer Portal → Bot tab
   - `DISCORD_CLIENT_ID` — Application ID from the General Information tab
   - `STAFF_ROLE_ID` — Discord role ID for moderators (optional, disables staff-gated commands if absent)

2. **Install dependencies**
   ```
   pnpm install
   ```

3. **Run setup** (pushes DB schema + registers slash commands)
   ```
   pnpm run setup
   ```

4. **Start the bot** — use the **Discord Bot** workflow (runs automatically on Replit).

## Day-to-day commands

| Command | Purpose |
|---|---|
| `pnpm --filter @workspace/db run push` | Push Drizzle schema changes to the database |
| `pnpm --filter @workspace/discord-bot run deploy-commands` | Re-register slash commands with Discord |
| `pnpm run setup` | Combined: push schema + deploy commands |
| `pnpm --filter @workspace/api-server run dev` | Start the API server locally |

## Slash commands

| Command | Description |
|---|---|
| `/cola` | Join/leave the matchmaking queue |
| `/lobby` | Manage match lobbies |
| `/postular` | Apply or review applications (staff-gated) |
| `/ranking` | View ELO leaderboard |
| `/sanciones` | Manage sanctions/bans |
| `/logros` | View player achievements |
| `/perfil` | View a player profile |
| `/temporada` | Season management |
| `/supervisor` | Staff supervision tools |
| `/revision` | Match review tools |
| `/help` | Help command |

## Database

Uses **Drizzle ORM** with Replit's built-in PostgreSQL. The schema is in `lib/db/src/schema/`. Push changes with:

```
pnpm --filter @workspace/db run push
```

`DATABASE_URL` is provided automatically by Replit — do not set it manually.

## User preferences

- Keep existing monorepo structure and stack
