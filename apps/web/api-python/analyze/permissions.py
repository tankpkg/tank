"""POST /api/analyze/permissions — Extract permissions from SKILL.md content using LLM."""

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Any, Dict, List, Optional

from ._lib import call_llm, parse_llm_json

app = FastAPI(title="Tank Permission Extraction", version="0.1.0")

MODEL = "qwen/qwen3-coder:free"

SYSTEM_PROMPT = """You are a security analyst for AI agent skill packages. Analyze the following SKILL.md file and extract all permissions the skill requires.

Return a JSON object with this exact structure:
{
  "permissions": {
    "network": { "outbound": ["domain1.com", "*.example.com"] },
    "filesystem": { "read": ["./path/**"], "write": ["./path/**"] },
    "subprocess": true or false
  },
  "reasoning": "Brief explanation of why these permissions are needed"
}

Rules:
- Only include permission categories that are actually used
- Use glob patterns for filesystem paths
- Use wildcard domains (*.example.com) for API domains
- Set subprocess to true ONLY if the skill runs shell commands
- If no permissions are needed, return empty objects
- Be conservative — only extract what's explicitly mentioned or clearly implied"""


class PermissionsRequest(BaseModel):
    skill_content: str


class NetworkPermissions(BaseModel):
    outbound: Optional[List[str]] = None


class FilesystemPermissions(BaseModel):
    read: Optional[List[str]] = None
    write: Optional[List[str]] = None


class ExtractedPermissions(BaseModel):
    network: Optional[NetworkPermissions] = None
    filesystem: Optional[FilesystemPermissions] = None
    subprocess: Optional[bool] = None


class PermissionsResponse(BaseModel):
    permissions: Dict[str, Any]
    reasoning: str


@app.post("/api/analyze/permissions")
async def extract_permissions(request: PermissionsRequest) -> PermissionsResponse:
    """Extract permissions from SKILL.md content using LLM analysis."""
    if not request.skill_content.strip():
        return PermissionsResponse(
            permissions={},
            reasoning="Empty skill content provided — no permissions detected.",
        )

    try:
        raw = await call_llm(MODEL, SYSTEM_PROMPT, request.skill_content)
        parsed = parse_llm_json(raw)

        permissions = parsed.get("permissions", {})
        reasoning = parsed.get("reasoning", "No reasoning provided by model.")

        # Validate and clean the permissions structure
        clean_perms: Dict[str, Any] = {}
        if "network" in permissions and permissions["network"]:
            clean_perms["network"] = permissions["network"]
        if "filesystem" in permissions and permissions["filesystem"]:
            clean_perms["filesystem"] = permissions["filesystem"]
        if "subprocess" in permissions:
            clean_perms["subprocess"] = bool(permissions["subprocess"])

        return PermissionsResponse(permissions=clean_perms, reasoning=reasoning)

    except ValueError:
        # Missing API key or invalid JSON from LLM
        return JSONResponse(
            status_code=500,
            content={"error": "Analysis failed due to configuration error"},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"error": "Analysis failed due to an internal error"},
        )
