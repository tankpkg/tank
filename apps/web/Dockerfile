# Tank Web - Next.js 15 Standalone
# Multi-stage build for minimal production image

# Stage 1: Install dependencies
FROM oven/bun:1-alpine AS deps
WORKDIR /app

# Copy package files (all workspace package.json files needed for lockfile resolution)
COPY package.json bun.lock ./
COPY packages/internals-schemas/package.json ./packages/internals-schemas/
COPY packages/internals-helpers/package.json ./packages/internals-helpers/
COPY apps/web/package.json ./apps/web/
COPY apps/web-astro/package.json ./apps/web-astro/
COPY apps/web-tanstack/package.json ./apps/web-tanstack/
COPY packages/cli/package.json ./packages/cli/
COPY packages/mcp-server/package.json ./packages/mcp-server/
COPY .bdd/package.json ./.bdd/

# Install dependencies
RUN bun install --frozen-lockfile

# Stage 2: Build the application
FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY package.json bun.lock tsconfig.json turbo.json eslint.config.ts ./
COPY packages/internals-schemas ./packages/internals-schemas
COPY packages/internals-helpers ./packages/internals-helpers
COPY apps/web ./apps/web

# Copy node_modules from deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/internals-schemas/node_modules ./packages/internals-schemas/node_modules
COPY --from=deps /app/packages/internals-helpers/node_modules ./packages/internals-helpers/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# Build internal packages first
RUN bun run --filter=@internals/schemas build
RUN bun run --filter=@internals/helpers build

# Build web app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV STANDALONE=true
RUN bun run --filter=@tankpkg/web build

# Stage 3: Production image
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Copy drizzle migrations for runtime
COPY --from=builder /app/apps/web/drizzle ./apps/web/drizzle

# Set correct ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "apps/web/server.js"]
