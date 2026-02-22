"""Benign skill: Reads specific environment variable for config.

Expected result: NO critical findings (medium at most for env access).
Reading a specific, named env var is normal configuration behavior.
"""
import os

def get_log_level() -> str:
    """Get log level from environment or default."""
    return os.getenv("LOG_LEVEL", "INFO")

def get_database_url() -> str:
    """Get database URL from environment."""
    return os.getenv("DATABASE_URL", "sqlite:///local.db")

def get_timeout() -> int:
    """Get request timeout from environment."""
    try:
        return int(os.getenv("REQUEST_TIMEOUT", "30"))
    except ValueError:
        return 30

# This is fine - reading specific named variables
DEBUG = os.getenv("DEBUG", "false").lower() == "true"
