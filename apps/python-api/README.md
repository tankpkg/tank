# Tank Security Scanner - Python API

FastAPI-based security scanner for Claude Code skills.

## Features

- **6-Stage Pipeline**: Ingestion, Structure, Static Analysis, Injection Detection, Secrets, Dependencies
- **Multiple Tools**: Semgrep, Bandit, detect-secrets, OSV API
- **Custom Rules**: Agent-specific threat detection
- **Deduplication**: Findings merged across tools with confidence boosting
- **SARIF Export**: Industry-standard output format

## Local Development

```bash
# Install dependencies (using uv)
uv sync

# Run development server
uv run uvicorn api.main:app --reload --host 0.0.0.0 --port 8000

# Run tests
uv run pytest

# Run with Docker
docker build -t tank-scanner .
docker run -p 8000:8000 tank-scanner
```

## API Endpoints

- `GET /` - API info
- `GET /health` - Health check
- `GET /health/llm` - LLM provider status
- `POST /api/analyze/scan` - Full security scan
- `POST /api/analyze/security` - Quick security check
- `POST /api/analyze/permissions` - Permission extraction
- `GET /docs` - OpenAPI documentation
- `GET /redoc` - ReDoc documentation

## Vercel Deployment

### Important: Requirements File Structure

The root `requirements.txt` file is **required** for Vercel's Python runtime. It contains a redirect to this package's dependencies:

```
# Vercel Python dependencies - redirects to apps/python-api
-r apps/python-api/requirements.txt
```

**⚠️ Do not delete the root requirements.txt file!**

Vercel's Python runtime expects `requirements.txt` at the project root and does not automatically search subdirectories. Without this redirect file, Vercel will fail to install dependencies, resulting in deployment errors like:

```
ModuleNotFoundError: No module named 'fastapi'
```

### Deployment Configuration

- **Runtime**: Python 3.14 (specified in `.python-version`)
- **Package Manager**: uv (fast Python package installer)
- **Dependencies**: `pyproject.toml` (modern Python packaging)
- **Entrypoint**: `index.py` (imports FastAPI app from `api/main.py`)
- **Framework**: Auto-detected by Vercel
- **Routing**: Configured via `vercel.json` rewrites

### Important: Vercel Rewrites Configuration

The `vercel.json` file contains rewrites configuration essential for FastAPI routing:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index" }]
}
```

**⚠️ Do not delete the vercel.json file!**

Without this configuration, Vercel won't route requests to the Python serverless function, resulting in `FUNCTION_INVOCATION_FAILED` errors.

### Troubleshooting

If deployment fails with module import errors:

1. Verify `pyproject.toml` exists with dependencies
2. Check `.python-version` specifies Python 3.14
3. Ensure `index.py` entrypoint exists at root
4. **Verify `vercel.json` exists with rewrites configuration**
5. Review Vercel deployment logs for specific errors

If you see `FUNCTION_INVOCATION_FAILED`:

- Check that `vercel.json` has the rewrites configuration
- Verify the `index.py` entrypoint exists
- Check Vercel function logs for runtime errors
- Ensure `pyproject.toml` has the `[project.scripts]` section pointing to `api.main:app`

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=api --cov=lib --cov-report=html

# Run specific test
pytest tests/test_analyze.py -v
```

## Architecture

```
apps/python-api/
├── api/
│   ├── main.py              # FastAPI app and route aggregation
│   ├── index.py             # Vercel entrypoint (re-exports main.py)
│   └── analyze/
│       ├── scan.py          # Full scan endpoint
│       ├── security.py      # Quick security check
│       ├── permissions.py   # Permission extraction
│       ├── rescan.py        # Rescan endpoint
│       └── index.py         # Health check / echo endpoint
├── lib/
│   └── scan/                # Scanning pipeline implementation
├── tests/                   # Test suite
├── requirements.txt         # Python dependencies
├── runtime.txt              # Python version for Vercel
└── pytest.ini               # Test configuration
```

## Security Notes

- API keys are never exposed in `/health/llm` endpoint
- CORS configured for `*.tankpkg.dev` domains
- All scanner tools run in isolated environments
- Secrets detection uses baseline configuration

## License

Private - Tank Package
