"""LLM provider health check endpoint.

Extracted from llm_analyzer.py to keep the analyzer class under 500 lines.
"""

import time
from typing import Any

import httpx
from lib.scan.llm_analyzer import LLMAnalyzer


async def check_llm_health() -> dict[str, Any]:
    """Check health of all configured LLM providers."""
    analyzer = LLMAnalyzer()

    result: dict[str, Any] = {
        "llm_scan_enabled": analyzer.is_enabled(),
        "mode": analyzer.mode,
        "providers": [],
    }

    if not analyzer.providers:
        return result

    for provider in analyzer.providers:
        provider_status: dict[str, Any] = {
            "name": provider.name,
            "model": provider.model,
            "api_key_configured": bool(provider.api_key),
            "base_url": provider.base_url,
            "status": "unknown",
            "latency_ms": None,
            "error": None,
        }

        try:
            start = time.monotonic()
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(
                    f"{provider.base_url.rstrip('/')}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {provider.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": provider.model,
                        "messages": [{"role": "user", "content": "ping"}],
                        "max_tokens": 5,
                    },
                )

            latency_ms = int((time.monotonic() - start) * 1000)
            provider_status["latency_ms"] = latency_ms

            if response.status_code == 200:
                provider_status["status"] = "healthy"
            elif response.status_code == 429:
                provider_status["status"] = "rate_limited"
            else:
                provider_status["status"] = "unhealthy"
                provider_status["error"] = f"HTTP {response.status_code}"

        except httpx.TimeoutException:
            provider_status["status"] = "timeout"
            provider_status["error"] = "Request timed out"
        except Exception as e:
            provider_status["status"] = "error"
            provider_status["error"] = str(e)[:100]

        result["providers"].append(provider_status)

    return result
