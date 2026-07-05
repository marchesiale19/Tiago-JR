---
name: Discord/gateway bots as workspace packages
description: How to package a long-running Discord/gateway-style bot in the pnpm monorepo, since it doesn't fit the artifact model.
---

Discord bots (and similar persistent-gateway-connection services) are not HTTP servers and have no preview surface, so `createArtifact()` doesn't apply. Build them as a plain workspace package under `artifacts/<slug>/` (workspace name `@workspace/<slug>`) with its own `package.json`/`tsconfig.json` following the `api-server` leaf-package pattern, then register a console-output workflow via `configureWorkflow` (no `waitForPort` — the process doesn't listen on a port).

**Why:** The artifact skill's `createArtifact` types (react-vite, expo, slides, etc.) all assume a servable preview path. A bot process has neither a port nor a UI, so forcing it through that flow doesn't work — but `configureWorkflow` still runs and supervises it like any other long-lived process.

**How to apply:** When asked for a Discord/Telegram/Slack-style bot with no accompanying web UI, skip `createArtifact` entirely. Request the platform's bot token/credentials via `requestEnvVar` first, scaffold the package, run `pnpm install`, then `configureWorkflow({ name: "<Bot Name>", command: "pnpm --filter @workspace/<slug> run dev", outputType: "console" })`. Slash-command style bots also need a one-off `deploy-commands` script run after any command definition change, since Discord caches registered commands globally.
