FROM oven/bun:1-alpine AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/internals-schemas/package.json ./packages/internals-schemas/
COPY packages/internals-helpers/package.json ./packages/internals-helpers/
COPY apps/web/package.json ./apps/web/
COPY apps/web-astro/package.json ./apps/web-astro/
COPY apps/web-tanstack/package.json ./apps/web-tanstack/
COPY packages/cli/package.json ./packages/cli/
COPY packages/mcp-server/package.json ./packages/mcp-server/
COPY .bdd/package.json ./.bdd/

RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY package.json bun.lock tsconfig.json turbo.json biome.json ./
COPY packages/internals-schemas ./packages/internals-schemas
COPY packages/internals-helpers ./packages/internals-helpers
COPY apps/web-tanstack ./apps/web-tanstack

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/internals-schemas/node_modules ./packages/internals-schemas/node_modules
COPY --from=deps /app/packages/internals-helpers/node_modules ./packages/internals-helpers/node_modules
COPY --from=deps /app/apps/web-tanstack/node_modules ./apps/web-tanstack/node_modules

RUN bun run --filter=@internals/schemas build
RUN bun run --filter=@internals/helpers build
RUN bun run --filter=@tankpkg/web-tanstack build

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 tanstack

COPY --from=builder /app/apps/web-tanstack/.output ./.output

RUN chown -R tanstack:nodejs /app

USER tanstack

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", ".output/server/index.mjs"]
