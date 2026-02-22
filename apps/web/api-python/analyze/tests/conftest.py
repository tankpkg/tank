"""Pytest configuration for Tank Analysis API tests.

Ensures proper module setup before tests run.
"""
import sys
from pathlib import Path

# Add project root to path so imports work
project_root = Path(__file__).parent.parent.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# No pre-imports needed - static analysis endpoints don't use external modules
