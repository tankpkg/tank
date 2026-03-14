FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json bun.lock ./
COPY packages/internals-schemas/package.json ./packages/internals-schemas/
COPY packages/internals-helpers/package.json ./packages/internals-helpers/
COPY apps/web-astro/package.json ./apps/web-astro/
RUN bun install --frozen-lockfile

# Build internals, then web app
COPY packages/ ./packages/
COPY apps/web-astro/ ./apps/web-astro/
COPY tsconfig.json ./
RUN bun run --filter=@internals/schemas build
RUN bun run --filter=@internals/helpers build
RUN cd apps/web-astro && bun run build

FROM oven/bun:1-alpine AS runner
WORKDIR /app
RUN addgroup --system tank && adduser --system --ingroup tank tank
COPY --from=builder /app/apps/web-astro/dist ./dist
COPY --from=builder /app/apps/web-astro/drizzle ./drizzle
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
USER tank
EXPOSE 4321
ENV HOST=0.0.0.0
ENV PORT=4321
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4321/api/health || exit 1
CMD ["bun", "run", "dist/server/entry.mjs"]
