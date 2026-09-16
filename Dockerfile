FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY . .

RUN pnpm install --frozen-lockfile

CMD ["pnpm", "--filter", "@workspace/discord-bot", "run", "dev"]
