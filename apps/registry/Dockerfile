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
COPY packages/cli ./packages/cli
COPY packages/mcp-server ./packages/mcp-server

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/internals-schemas/node_modules ./packages/internals-schemas/node_modules
COPY --from=deps /app/packages/internals-helpers/node_modules ./packages/internals-helpers/node_modules
COPY --from=deps /app/apps/registry/node_modules ./apps/registry/node_modules
COPY --from=deps /app/packages/cli/node_modules ./packages/cli/node_modules
COPY --from=deps /app/packages/mcp-server/node_modules ./packages/mcp-server/node_modules

RUN bun run --filter=@internals/schemas build && \
    bun run --filter=@internals/helpers build && \
    rm -rf apps/registry/.output && \
    bun run --filter=registry build && \
    bun build apps/registry/src/lib/db/schema.ts \
      --outdir apps/registry/dist-db --target=node --format=esm --external=drizzle-orm && \
    cat > apps/registry/dist-db/drizzle.config.js << 'DRIZZLE_EOF'
import { defineConfig } from "drizzle-kit";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/lib/db/schema.js"],
  dbCredentials: { url: databaseUrl },
});
DRIZZLE_EOF

# Build CLI binaries for on-prem distribution
RUN bun run --filter=@tankpkg/cli build && \
    bun run --filter=@tankpkg/cli build:bundle && \
    mkdir -p /app/cli-binaries && \
    bun build --compile packages/cli/build/tank-bundle.mjs --target bun-linux-x64 --outfile /app/cli-binaries/tank-linux-x64 && \
    bun build --compile packages/cli/build/tank-bundle.mjs --target bun-linux-arm64 --outfile /app/cli-binaries/tank-linux-arm64 && \
    chmod +x /app/cli-binaries/*

# Stage 3: Production
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 bunjs && \
    adduser --system --uid 1001 tanstack && \
    bun add esbuild esbuild-register @esbuild-kit/esm-loader @esbuild-kit/core-utils postgres && \
    chown -R tanstack:bunjs /app/node_modules

COPY --from=builder --chown=tanstack:bunjs /app/apps/registry/.output ./.output
COPY --from=builder --chown=tanstack:bunjs /app/apps/registry/scripts/entrypoint.sh ./entrypoint.sh
COPY --from=builder --chown=tanstack:bunjs /app/apps/registry/scripts/load-settings-from-db.ts ./scripts/load-settings-from-db.ts
COPY --from=builder --chown=tanstack:bunjs /app/apps/registry/dist-db/drizzle.config.js ./drizzle.config.js
COPY --from=builder --chown=tanstack:bunjs /app/apps/registry/dist-db/schema.js ./src/lib/db/schema.js
COPY --from=deps --chown=tanstack:bunjs /app/apps/registry/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=deps --chown=tanstack:bunjs /app/apps/registry/node_modules/drizzle-kit ./node_modules/drizzle-kit

COPY --from=builder --chown=tanstack:bunjs /app/cli-binaries /app/cli-binaries

RUN chmod +x entrypoint.sh

USER tanstack

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["sh", "./entrypoint.sh"]
