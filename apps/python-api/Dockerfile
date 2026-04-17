# Tank Security Scanner — FastAPI
# Build context: repo root (for uv.lock access)

# Stage 1: Build
FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libffi-dev \
    libssl-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY apps/python-api/pyproject.toml ./
COPY uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# Build-time health check: verify detect-secrets is importable
RUN .venv/bin/python -c "import detect_secrets; print('detect-secrets: OK')"

COPY apps/python-api/api ./api
COPY apps/python-api/lib ./lib

# Stage 2: Production
FROM python:3.12-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libffi8 \
    libssl3 \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (slim) + tokenomics CLI for Stage T token analysis
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g tokenomics@^2.3.1 \
    && apt-get purge -y curl \
    && rm -rf /var/lib/apt/lists/*

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
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
