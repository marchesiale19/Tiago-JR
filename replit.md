# Discord Application Bot

A Discord bot that runs a `/postular` slash command, which DMs the user a short application questionnaire and collects their answers.

## Run & Operate

- `pnpm --filter @workspace/discord-bot run dev` — run the Discord bot (workflow: "Discord Bot")
- `pnpm --filter @workspace/discord-bot run deploy-commands` — register/update slash commands with Discord (run after changing command definitions)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required secrets: `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`
- Optional env: `APPLICATION_LOG_CHANNEL_ID` — channel ID where completed `/postular` submissions get posted

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/discord-bot/src/index.ts` — bot client login and interaction dispatch
- `artifacts/discord-bot/src/commands/postular.ts` — the `/postular` command logic (DM questionnaire)
- `artifacts/discord-bot/src/deploy-commands.ts` — one-off script to (re)register slash commands with Discord
- `artifacts/api-server` — unrelated shared API server scaffold, not currently used by the bot

## Architecture decisions

- The bot is its own workspace package (`@workspace/discord-bot`) with its own workflow, separate from `api-server` — it's a long-running gateway connection, not an HTTP service, so it doesn't fit the artifact/preview model.
- Slash commands must be re-registered (`pnpm --filter @workspace/discord-bot run deploy-commands`) any time a command's name/description/options change; Discord caches command definitions globally.

## Product

- `/postular` — a slash command any server member can run to apply for the Trial Helper role. The bot DMs the user 6 questions (name, age, staff experience, who they hang out with, what they'd contribute as staff, weekly activity level), collects answers one at a time (5 min timeout per question), then posts the full application as an embed with Approve/Reject buttons to the `postulaciones-staff` channel (auto-created if missing, and kept private — `@everyone` is denied View Channel; set `STAFF_ROLE_ID` to also grant a specific staff role view access, otherwise only Administrators can see it). Members with `ManageRoles` permission can click the buttons to decide; the applicant is DMed the outcome. Each user has a 5-minute cooldown between uses of `/postular`.
- `APPLICATION_LOG_CHANNEL_ID` (legacy/optional) is no longer used by `/postular` — applications now always go to the `postulaciones-staff` channel.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The bot needs the "Message Content" behavior is NOT required for slash commands/DMs used here — only `Guilds` and `DirectMessages` intents are enabled. If future features need to read message content in guild channels, enable the "Message Content Intent" in the Discord Developer Portal and add `GatewayIntentBits.MessageContent`.
- `/postular` will fail to DM users who have "Allow direct messages from server members" disabled in their Discord privacy settings — the command replies ephemerally with guidance in that case.
- The bot needs the "Manage Channels" permission in the server to auto-create `postulaciones-staff` if it doesn't already exist.
- Approve/Reject buttons require the clicking member to have the `ManageRoles` permission; otherwise they get an ephemeral "no permission" reply.
- The 5-minute `/postular` cooldown is tracked in-memory per user — it resets if the bot restarts.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
