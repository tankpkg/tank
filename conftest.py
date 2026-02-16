"""Root conftest — make apps.web.api resolve to apps/web/api-python."""

import importlib
import pathlib
import sys
import types

ROOT = pathlib.Path(__file__).resolve().parent

# Build the package chain: apps → apps.web → apps.web.api
for pkg in ("apps", "apps.web", "apps.web.api"):
    if pkg not in sys.modules:
        mod = types.ModuleType(pkg)
        mod.__path__ = []
        mod.__package__ = pkg
        sys.modules[pkg] = mod

# Point apps.web.api.__path__ to the actual api-python directory
sys.modules["apps.web.api"].__path__ = [str(ROOT / "apps" / "web" / "api-python")]
