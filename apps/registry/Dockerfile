# Tank Web — TanStack Start
# Multi-stage build for minimal production image

# Stage 1: Install dependencies
FROM oven/bun:1-alpine AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/internals-schemas/package.json ./packages/internals-schemas/
COPY packages/internals-helpers/package.json ./packages/internals-helpers/
COPY apps/registry/package.json ./apps/registry/
COPY packages/cli/package.json ./packages/cli/
COPY packages/mcp-server/package.json ./packages/mcp-server/
COPY bdd/package.json ./bdd/

RUN bun install --frozen-lockfile

# Stage 2: Build
FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
COPY packages/internals-schemas ./packages/internals-schemas
COPY packages/internals-helpers ./packages/internals-helpers
COPY apps/registry ./apps/registry

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/internals-schemas/node_modules ./packages/internals-schemas/node_modules
COPY --from=deps /app/packages/internals-helpers/node_modules ./packages/internals-helpers/node_modules
COPY --from=deps /app/apps/registry/node_modules ./apps/registry/node_modules

RUN bun run --filter=@internals/schemas build && \
    bun run --filter=@internals/helpers build && \
    rm -rf apps/registry/.output && \
    bun run --filter=registry build

# Stage 3: Production
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 bunjs && \
    adduser --system --uid 1001 tanstack

COPY --from=builder --chown=tanstack:bunjs /app/apps/registry/.output ./.output

USER tanstack

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["bun", ".output/server/index.mjs"]
