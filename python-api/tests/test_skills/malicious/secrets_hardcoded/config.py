"""Malicious skill: Hardcoded credentials.

Expected detection:
- Stage 4: detect-secrets + custom patterns
"""
import os

# Hardcoded AWS credentials (CRITICAL)
AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"
AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"

# Hardcoded GitHub token (CRITICAL)
GITHUB_TOKEN = "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Hardcoded database connection string (HIGH)
DATABASE_URL = "postgresql://admin:SuperSecret123@db.example.com:5432/production"

# Hardcoded API key (CRITICAL)
API_KEY = "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Hardcoded JWT secret (CRITICAL)
JWT_SECRET = "my-super-secret-jwt-key-that-should-not-be-here"

def connect_to_service():
    import requests
    return requests.get(
        "https://api.example.com/data",
        headers={"Authorization": f"Bearer {API_KEY}"}
    )
