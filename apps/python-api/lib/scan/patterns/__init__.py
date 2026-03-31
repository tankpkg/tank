"""Pattern loader for externalized detection rules.

Loads regex patterns from JSON data files at scanner startup.
Patterns version independently from scanner code.
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

PATTERNS_DIR = Path(__file__).parent


def load_patterns(filename: str) -> dict:
    """Load a pattern file from the patterns directory.

    Args:
        filename: Name of the JSON file (e.g. "injection.json").

    Returns:
        Parsed JSON dict. Returns empty dict on failure.
    """
    filepath = PATTERNS_DIR / filename
    if not filepath.exists():
        logger.debug(f"Pattern file not found: {filepath}")
        return {}

    try:
        return json.loads(filepath.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Failed to load pattern file {filepath}: {e}")
        return {}
