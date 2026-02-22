"""Benign skill: Complex but safe - multiple files, no issues.

Expected result: NO critical/high findings.
"""

# utils.py
def format_output(data: dict) -> str:
    """Format data for output."""
    return "\n".join(f"{k}: {v}" for k, v in data.items())

def validate_input(data: dict, required_keys: list) -> bool:
    """Validate that required keys are present."""
    return all(key in data for key in required_keys)
