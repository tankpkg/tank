"""Pytest configuration for Tank Analysis API tests.

Ensures proper module setup before tests run.
"""

import sys
from pathlib import Path

# Add scanner root to path so imports work
scanner_root = Path(__file__).parent.parent.parent.parent
if str(scanner_root) not in sys.path:
    sys.path.insert(0, str(scanner_root))
