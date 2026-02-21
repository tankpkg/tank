"""Complex but safe skill - multiple modules working together."""

from .main import format_output, validate_input
from .processor import DataProcessor

__all__ = ["format_output", "validate_input", "DataProcessor"]
