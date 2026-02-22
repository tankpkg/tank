"""Benign skill: File operations within own directory.

Expected result: NO critical/high findings.
"""
import json
from pathlib import Path

class FileManager:
    """Manages files within the skill's own directory."""

    def __init__(self, base_dir: str = "."):
        self.base_dir = Path(base_dir)

    def read_data(self, filename: str) -> dict:
        """Read data from a file in the skill directory."""
        filepath = self.base_dir / filename
        with open(filepath, "r") as f:
            return json.load(f)

    def write_data(self, filename: str, data: dict) -> None:
        """Write data to a file in the skill directory."""
        filepath = self.base_dir / filename
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)

    def list_files(self) -> list:
        """List files in the skill directory."""
        return [f.name for f in self.base_dir.iterdir() if f.is_file()]
