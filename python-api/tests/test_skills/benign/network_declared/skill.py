"""Benign skill: Network requests with proper permissions declaration.

Expected result: NO critical/high findings if permissions are declared.

This skill makes legitimate API calls to known services.
"""
import httpx

# These domains should be declared in permissions
API_ENDPOINTS = {
    "github": "https://api.github.com",
    "pypi": "https://pypi.org/pypi",
}

def fetch_github_user(username: str) -> dict:
    """Fetch user info from GitHub API."""
    response = httpx.get(f"{API_ENDPOINTS['github']}/users/{username}")
    return response.json()

def get_package_info(package_name: str) -> dict:
    """Get package info from PyPI."""
    response = httpx.get(f"{API_ENDPOINTS['pypi']}/{package_name}/json")
    return response.json()
