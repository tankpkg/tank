"""Tank Scanner - Main API Entry Point

Aggregates all scanner endpoints for container deployment.

Endpoints:
- POST /api/analyze/scan - Full security scan
- POST /api/analyze/security - Quick security check
- POST /api/analyze/permissions - Permission extraction
- GET /api/analyze/scan/health - Health check
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import individual API apps
from api.analyze.scan import app as scan_app
from api.analyze.security import app as security_app
from api.analyze.permissions import app as permissions_app

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

# CORS configuration for Next.js integration
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.tankpkg\.dev$|http://localhost:3000",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount sub-apps
# Note: In production, these would be included directly in the routing
app.include_router(scan_app.router, prefix="/api/analyze", tags=["scan"])
app.include_router(security_app.router, prefix="/api/analyze", tags=["security"])
app.include_router(permissions_app.router, prefix="/api/analyze", tags=["permissions"])


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


# Export for uvicorn
# Run with: uvicorn api.main:app --host 0.0.0.0 --port 8000
