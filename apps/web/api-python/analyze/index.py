"""POST /api/analyze — Health check / echo endpoint for Tank Analysis API."""

from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="Tank Analysis API", version="0.1.0")


class AnalyzeRequest(BaseModel):
    skill_content: Optional[str] = None


class AnalyzeResponse(BaseModel):
    status: str
    message: str
    content_length: Optional[int] = None


@app.post("/api/analyze")
async def analyze(request: AnalyzeRequest = AnalyzeRequest()) -> AnalyzeResponse:
    """Health check endpoint. Optionally echoes metadata about provided skill content."""
    return AnalyzeResponse(
        status="ok",
        message="Tank Analysis API is running",
        content_length=len(request.skill_content)
        if request.skill_content is not None
        else None,
    )
