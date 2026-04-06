# Tank Security Scanner — FastAPI
# Build context: repo root (for uv.lock access)

# Stage 1: Build
FROM python:3.12-alpine AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

RUN apk add --no-cache \
    build-base \
    libffi-dev \
    openssl-dev \
    postgresql-dev

COPY apps/python-api/pyproject.toml ./
COPY uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# Build-time health check: verify detect-secrets is importable
RUN python -c "import detect_secrets; print('detect-secrets:', detect_secrets.__version__)"

COPY apps/python-api/api ./api
COPY apps/python-api/lib ./lib

# Stage 2: Production
FROM python:3.12-alpine AS runner

WORKDIR /app

RUN apk add --no-cache \
    libffi \
    openssl \
    libpq

RUN addgroup --system --gid 1001 tank && \
    adduser --system --uid 1001 --ingroup tank scanner

COPY --from=builder --chown=scanner:tank /app/.venv /app/.venv
COPY --from=builder --chown=scanner:tank /app/api ./api
COPY --from=builder --chown=scanner:tank /app/lib ./lib

ENV PATH="/app/.venv/bin:$PATH"

USER scanner

EXPOSE 8000

ENV HOST="0.0.0.0"
ENV PORT=8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8000/health || exit 1

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
