# Tank Python API - Security Scanner
# FastAPI application for skill security analysis

FROM python:3.14-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    build-base \
    libffi-dev \
    openssl-dev \
    postgresql-dev

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Production image
FROM python:3.14-alpine AS runner

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    libffi \
    openssl \
    libpq

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application code
COPY api ./api
COPY lib ./lib

# Create non-root user
RUN addgroup --system --gid 1001 tank && \
    adduser --system --uid 1001 --ingroup tank scanner

RUN chown -R scanner:tank /app
USER scanner

EXPOSE 8000

ENV HOST="0.0.0.0"
ENV PORT=8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8000/health || exit 1

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
