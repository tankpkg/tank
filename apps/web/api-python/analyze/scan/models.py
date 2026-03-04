"""Pydantic models for the security scanning pipeline."""

from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ScanVerdict(str, Enum):
    """Possible scan verdicts ordered by severity."""

    PASS = "pass"
    PASS_WITH_NOTES = "pass_with_notes"
    FLAGGED = "flagged"
    FAIL = "fail"


class Finding(BaseModel):
    """A single security finding from any stage."""

    stage: str = Field(..., description="Stage that produced this finding (stage0-stage5)")
    severity: Literal["critical", "high", "medium", "low"] = Field(
        ..., description="Severity level"
    )
    type: str = Field(..., description="Finding type e.g. 'prompt_injection', 'shell_injection'")
    description: str = Field(..., description="Human-readable description")
    location: Optional[str] = Field(None, description="File:line or path reference")
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0, description="Confidence score 0-1")
    tool: Optional[str] = Field(None, description="Tool or rule that found this")
    evidence: Optional[str] = Field(None, description="Raw snippet or pattern matched")
    llm_verdict: Optional[str] = Field(None, description="LLM classification: likely_benign, confirmed_threat, uncertain")
    llm_reviewed: bool = Field(False, description="Whether LLM analyzed this finding")


class StageResult(BaseModel):
    """Result from a single scanning stage."""

    stage: str = Field(..., description="Stage identifier (stage0-stage5)")
    status: Literal["passed", "failed", "errored", "skipped"] = Field(
        ..., description="Stage execution status"
    )
    findings: List[Finding] = Field(default_factory=list, description="Findings from this stage")
    duration_ms: int = Field(..., description="Stage execution time in milliseconds")
    error: Optional[str] = Field(None, description="Error message if status is 'errored'")


class ScanRequest(BaseModel):
    """Request to run a full security scan."""

    tarball_url: str = Field(..., description="Signed URL to download the skill tarball")
    version_id: str = Field(..., description="skill_versions.id UUID")
    manifest: Dict[str, Any] = Field(..., description="Skill manifest from database")
    permissions: Dict[str, Any] = Field(..., description="Declared permissions from database")


class LLMProviderStatus(BaseModel):
    """Status of a single LLM provider."""
    name: str = Field(..., description="Provider name")
    model: str = Field(..., description="Model identifier")
    api_key_configured: bool = Field(..., description="Whether API key is set")
    base_url: str = Field(..., description="API base URL")
    status: str = Field(..., description="healthy, unhealthy, rate_limited, etc.")
    latency_ms: Optional[int] = Field(None, description="Response latency")
    error: Optional[str] = Field(None, description="Error message if unhealthy")


class LLMAnalysis(BaseModel):
    """LLM analysis metadata for a scan."""
    enabled: bool = Field(..., description="Whether LLM analysis was enabled")
    mode: str = Field(..., description="byollm, builtin, or disabled")
    providers: List[LLMProviderStatus] = Field(default_factory=list, description="Provider statuses")


class ScanResponse(BaseModel):
    """Response from a full security scan."""

    scan_id: Optional[str] = Field(None, description="UUID of stored scan result")
    verdict: str = Field(..., description="Final verdict (pass/pass_with_notes/flagged/fail)")
    findings: List[Finding] = Field(default_factory=list, description="All findings from all stages")
    stage_results: List[StageResult] = Field(
        default_factory=list, description="Results per stage"
    )
    duration_ms: int = Field(..., description="Total scan time in milliseconds")
    file_hashes: Dict[str, str] = Field(
        default_factory=dict, description="SHA-256 hashes per file path"
    )
    llm_analysis: Optional[LLMAnalysis] = Field(None, description="LLM analysis metadata")


class IngestResult(BaseModel):
    """Result from Stage 0 ingestion - used by all subsequent stages."""

    temp_dir: str = Field(..., description="Path to extracted temp directory")
    file_hashes: Dict[str, str] = Field(
        default_factory=dict, description="SHA-256 hash per relative file path"
    )
    file_list: List[str] = Field(default_factory=list, description="List of relative file paths")
    total_size: int = Field(..., description="Total extracted size in bytes")
    stage_result: StageResult = Field(..., description="Stage 0 result with any findings")
