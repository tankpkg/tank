"""Tank Scanner - Main API Entry Point

Aggregates all scanner endpoints for container deployment.

Endpoints:
- POST /api/analyze/scan - Full security scan
- POST /api/analyze/security - Quick security check
- POST /api/analyze/permissions - Permission extraction
- GET /api/analyze/scan/health - Health check
- GET /health/llm - LLM provider health status
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.analyze.index import app as analyze_index_app
from api.analyze.permissions import app as permissions_app
from api.analyze.rescan import app as rescan_app

# Import individual API apps
from api.analyze.scan import app as scan_app
from api.analyze.security import app as security_app
from lib.scan.llm_analyzer import check_llm_health

# Create main app
app = FastAPI(
    title="Tank Security Scanner",
    version="2.0.0",
    description="""
Tank Security Scanner - Comprehensive security analysis for Claude Code skills.

## Features

- **6-Stage Pipeline**: Ingestion, Structure, Static Analysis, Injection Detection, Secrets, Dependencies
- **Multiple Tools**: Semgrep, Bandit, detect-secrets, OSV API
- **Custom Rules**: Agent-specific threat detection
- **Deduplication**: Findings merged across tools with confidence boosting
- **SARIF Export**: Industry-standard output format

## Authentication

For production, add API key authentication between your Next.js app and this scanner.
    """,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS configuration for registry integration
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.tankpkg\.dev$|http://localhost:3000|http://localhost:5555",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount sub-apps
app.include_router(analyze_index_app.router, prefix="/api/analyze", tags=["analyze"])
app.include_router(scan_app.router, prefix="/api/analyze", tags=["scan"])
app.include_router(security_app.router, prefix="/api/analyze", tags=["security"])
app.include_router(permissions_app.router, prefix="/api/analyze", tags=["permissions"])
app.include_router(rescan_app.router, prefix="/api/analyze", tags=["rescan"])


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "Tank Security Scanner",
        "version": "2.0.0",
        "docs": "/docs",
        "health": "/api/analyze/scan/health",
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/health/llm")
async def llm_health():
    """Check LLM provider health status.

    Returns configuration and health status for all configured LLM providers.
    Does NOT expose API keys - only shows whether keys are configured.
    """
    return await check_llm_health()


# Export for uvicorn
# Run with: uvicorn api.main:app --host 0.0.0.0 --port 8000
