FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY . .

RUN pnpm install

CMD ["pnpm", "--filter", "@workspace/discord-bot", "run", "dev"]
