"""Shared OpenRouter client for Tank security analysis endpoints."""

import json
import os

import httpx

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions"


async def call_llm(model: str, system_prompt: str, user_content: str) -> str:
    """Call OpenRouter API with the given model and prompts.

    Returns the raw string content from the LLM response.
    Raises ValueError if OPENROUTER_API_KEY is not set.
    Raises httpx.HTTPStatusError on non-2xx responses.
    Raises httpx.TimeoutException on timeout.
    """
    if not OPENROUTER_API_KEY:
        raise ValueError("OPENROUTER_API_KEY environment variable is not set")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            OPENROUTER_BASE_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "HTTP-Referer": "https://tankpkg.dev",
                "X-Title": "Tank Security Analysis",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                "response_format": {"type": "json_object"},
            },
            timeout=60.0,
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


def parse_llm_json(raw: str) -> dict:
    """Parse JSON from LLM response, handling common quirks.

    Some models wrap JSON in markdown code fences — strip those first.
    Returns parsed dict or raises ValueError on invalid JSON.
    """
    text = raw.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```json or ```) and last line (```)
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    return json.loads(text)
