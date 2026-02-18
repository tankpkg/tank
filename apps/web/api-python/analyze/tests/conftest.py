"""Pytest configuration for Tank Analysis API tests.

Ensures proper module setup before tests run.
"""
import sys
from pathlib import Path

# Add project root to path so imports work
project_root = Path(__file__).parent.parent.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# Pre-import the modules that need to be patched
# This ensures they're in sys.modules before @patch decorators run
import apps.web.api.analyze._lib  # noqa: F401
