"""Processor module for complex_but_safe skill."""

import re
from typing import Any


class DataProcessor:
    """Processes data according to configuration."""

    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.patterns = self._compile_patterns()

    def _compile_patterns(self) -> dict[str, re.Pattern]:
        """Compile regex patterns from config."""
        patterns = {}
        for name, pattern in self.config.get("patterns", {}).items():
            patterns[name] = re.compile(pattern)
        return patterns

    def process(self, text: str) -> dict[str, list[str]]:
        """Extract matches for all patterns."""
        results = {}
        for name, pattern in self.patterns.items():
            matches = pattern.findall(text)
            results[name] = matches
        return results

    def transform(self, data: dict[str, Any]) -> dict[str, Any]:
        """Transform data according to config."""
        result = {}
        for key, value in data.items():
            if key in self.config.get("mappings", {}):
                result[self.config["mappings"][key]] = value
            else:
                result[key] = value
        return result
