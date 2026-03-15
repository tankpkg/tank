"""Vercel entrypoint - re-exports FastAPI app"""

from api.main import app

__all__ = ["app"]
