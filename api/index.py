"""Vercel FastAPI entrypoint - delegates to python-api"""
import sys
from pathlib import Path

# Add python-api to path
sys.path.insert(0, str(Path(__file__).parent / "python-api"))

from api.main import app
