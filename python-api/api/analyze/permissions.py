"""POST /api/analyze/permissions — Extract permissions from skill code using static analysis.

This endpoint uses deterministic AST and regex analysis instead of LLM-based
extraction. This is immune to prompt injection attacks that could manipulate
an LLM into returning incorrect permissions.
"""

from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Any, Dict, Optional
import os

from lib.scan.permission_extractor import extract_permissions

# Base directory under which all skill directories must reside
SKILL_BASE_DIR = os.environ.get("SKILL_BASE_DIR", "/workspace/skills")

app = FastAPI(title="Tank Permission Extraction", version="2.0.0")


class PermissionsRequest(BaseModel):
    skill_dir: Optional[str] = None  # Path to extracted skill directory
    skill_content: Optional[str] = None  # Fallback for compatibility


class PermissionsResponse(BaseModel):
    permissions: Dict[str, Any]
    reasoning: str
    method: str = "static_analysis"


@app.post("/api/analyze/permissions")
async def extract_permissions_endpoint(request: PermissionsRequest):
    """Extract permissions from skill code using static analysis.

    This endpoint analyzes Python, JavaScript, TypeScript, and shell files
    to determine what permissions a skill actually needs based on:
    - Network calls (fetch, requests, httpx, etc.)
    - Filesystem operations (read/write patterns)
    - Subprocess usage (os.system, child_process, etc.)
    - Environment variable access

    This is a deterministic replacement for the previous LLM-based approach,
    which was vulnerable to prompt injection attacks.
    """
    if request.skill_dir:
        try:
            # Resolve the configured base directory to an absolute, normalized path
            base_path = Path(SKILL_BASE_DIR).resolve()

            # Reject empty or whitespace-only skill_dir values
            skill_dir_value = request.skill_dir.strip()
            if not skill_dir_value:
                return JSONResponse(
                    status_code=400,
                    content={"error": "Invalid skill_dir: value must not be empty."},
                )

            skill_dir_path = Path(skill_dir_value)

            # Reject absolute paths to ensure callers cannot escape the base directory
            if skill_dir_path.is_absolute():
                return JSONResponse(
                    status_code=400,
                    content={"error": "Invalid skill_dir: absolute paths are not allowed."},
                )

            # Sanitize path by rejecting dangerous components
            safe_parts = []
            for part in skill_dir_path.parts:
                if part in ("..", "."):
                    return JSONResponse(
                        status_code=400,
                        content={"error": "Invalid skill_dir: path traversal not allowed."},
                    )
                if part and not part.startswith("."):
                    safe_parts.append(part)

            if not safe_parts:
                return JSONResponse(
                    status_code=400,
                    content={"error": "Invalid skill_dir: empty path."},
                )

            # Build path from sanitized components
            requested_path = base_path.joinpath(*safe_parts).resolve()

            # Ensure the resolved path is within the allowed base directory
            try:
                is_within_base = requested_path.is_relative_to(base_path)  # type: ignore[attr-defined]
            except AttributeError:
                # Fallback for Python versions without Path.is_relative_to
                # Walk up the directory tree from requested_path to see if we ever
                # reach base_path; if not, requested_path escapes the allowed root.
                current = requested_path
                is_within_base = False
                while True:
                    if current == base_path:
                        is_within_base = True
                        break
                    if current.parent == current:
                        # Reached filesystem root without finding base_path
                        break
                    current = current.parent

            if not is_within_base or not requested_path.is_dir():
                return JSONResponse(
                    status_code=400,
                    content={"error": "Invalid skill_dir: must refer to an existing directory within the configured skills base directory."},
                )

            permissions = extract_permissions(str(requested_path))
            reasoning = _generate_reasoning(permissions)

            return PermissionsResponse(
                permissions=permissions,
                reasoning=reasoning,
            )

        except Exception as e:
            # Log internally for debugging but return generic error to user
            # to avoid exposing stack traces or internal state
            # lgtm[py/stack-trace-exposure]
            import logging
            logging.debug("Permission extraction failed", exc_info=True)
            return JSONResponse(
                status_code=500,
                content={"error": "Permission extraction failed due to an internal error"},
            )

    # Fallback for legacy requests with skill_content
    if request.skill_content:
        return PermissionsResponse(
            permissions={},
            reasoning="Static analysis requires skill_dir parameter with extracted files. skill_content is no longer supported.",
        )

    return JSONResponse(
        status_code=400,
        content={"error": "Either skill_dir or skill_content is required"},
    )


def _generate_reasoning(permissions: Dict[str, Any]) -> str:
    """Generate a human-readable explanation of detected permissions."""
    parts = []

    network = permissions.get("network", {}).get("outbound", [])
    if network:
        if "*" in network:
            parts.append("makes network requests to arbitrary domains")
        else:
            domains = ", ".join(network[:5])
            if len(network) > 5:
                domains += f" and {len(network) - 5} more"
            parts.append(f"makes network requests to: {domains}")

    fs_read = permissions.get("filesystem", {}).get("read", [])
    fs_write = permissions.get("filesystem", {}).get("write", [])

    if fs_read and fs_write:
        parts.append(f"reads from {len(fs_read)} path(s) and writes to {len(fs_write)} path(s)")
    elif fs_read:
        parts.append(f"reads from {len(fs_read)} path(s)")
    elif fs_write:
        parts.append(f"writes to {len(fs_write)} path(s)")

    if permissions.get("subprocess"):
        parts.append("executes subprocess commands")

    env_vars = permissions.get("environment", [])
    if env_vars:
        parts.append(f"accesses environment variables: {', '.join(env_vars[:3])}")

    if not parts:
        return "No significant permissions detected - skill appears to operate within safe boundaries."

    return "Static analysis detected that this skill: " + "; ".join(parts) + "."
