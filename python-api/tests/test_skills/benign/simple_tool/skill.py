"""Benign skill: Simple tool with no issues.

Expected result: NO critical or high findings.
"""
import json
from pathlib import Path

def read_config(config_path: str) -> dict:
    """Read a JSON configuration file."""
    with open(config_path, "r") as f:
        return json.load(f)

def process_data(data: dict) -> list:
    """Process data and return results."""
    results = []
    for key, value in data.items():
        results.append(f"{key}: {value}")
    return results

def save_results(results: list, output_path: str) -> None:
    """Save results to a file."""
    with open(output_path, "w") as f:
        f.write("\n".join(results))
