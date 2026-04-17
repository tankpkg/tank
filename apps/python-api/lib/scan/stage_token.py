"""Stage T: Token Usage Analysis

Runs the tokenomics CLI tool to analyze token efficiency of a skill.
Falls back to a built-in pure Python estimator when no CLI is available.
Advisory-only — findings never affect the scan verdict.

Gracefully skips if the tokenomics CLI is not installed on PATH.
"""

import json
import logging
import os
import shutil
import subprocess
import time

from lib.scan.models import Finding, IngestResult, StageResult

logger = logging.getLogger(__name__)
TOKENOMICS_TIMEOUT = 10  # seconds
MIN_TOKENOMICS_VERSION = "2.3.1"

# Pricing: $/M input tokens (Claude public pricing)
SONNET_PRICE_PER_M = 3.0
OPUS_PRICE_PER_M = 15.0

# Thresholds for findings
PROMPT_TOKEN_WARN = 2000
PROMPT_TOKEN_HIGH = 5000
TOTAL_TOKEN_WARN = 10000
TOTAL_TOKEN_HIGH = 25000
TOOL_COUNT_WARN = 8


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token for English/code content."""
    return max(1, len(text) // 4)


def _estimate_cost(tokens: int) -> dict:
    """Estimate cost per invocation based on token count."""
    sonnet = f"~${tokens * SONNET_PRICE_PER_M / 1_000_000:.2f}"
    opus = f"~${tokens * OPUS_PRICE_PER_M / 1_000_000:.2f}"
    if tokens * SONNET_PRICE_PER_M / 1_000_000 < 0.01:
        sonnet = "<$0.01"
    if tokens * OPUS_PRICE_PER_M / 1_000_000 < 0.01:
        opus = "<$0.01"
    return {
        "sonnet_context_load": sonnet,
        "opus_context_load": opus,
        "token_count": tokens,
        "pricing_note": f"Based on input pricing: ${SONNET_PRICE_PER_M}/M (Sonnet), ${OPUS_PRICE_PER_M}/M (Opus). Actual cost depends on how the skill is loaded, cache behavior, and session length.",
    }


def _compute_grade(score: int) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"


def _run_pure_python_analysis(temp_dir: str) -> dict:
    """Pure Python token analysis — no external dependencies.

    Reads all text files in the skill directory, estimates token counts,
    and generates findings for oversized prompts or excessive tool counts.
    """
    total_chars = 0
    file_tokens: dict[str, int] = {}
    tool_count = 0

    for root, _dirs, files in os.walk(temp_dir):
        # Skip hidden dirs and node_modules
        _dirs[:] = [d for d in _dirs if not d.startswith(".") and d != "node_modules"]
        for fname in files:
            fpath = os.path.join(root, fname)
            rel = os.path.relpath(fpath, temp_dir)
            try:
                size = os.path.getsize(fpath)
                # Skip binary files (>100KB or no extension with high size)
                if size > 100_000:
                    continue
                with open(fpath, encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                tok = _estimate_tokens(content)
                total_chars += len(content)
                file_tokens[rel] = tok

                # Count tools from manifest files
                if fname in ("tank.json", "tank.jsonc") and content.strip().startswith("{"):
                    try:
                        manifest = json.loads(content)
                        atoms = manifest.get("atoms", [])
                        for atom in atoms:
                            if isinstance(atom, dict):
                                tools = atom.get("tools", [])
                                if isinstance(tools, list):
                                    tool_count += len(tools)
                    except (json.JSONDecodeError, TypeError):
                        pass
            except (OSError, PermissionError):
                continue

    total_tokens = sum(file_tokens.values())
    cost = _estimate_cost(total_tokens)

    # Generate findings
    findings: list[dict] = []

    # Check prompt/SKILL.md size
    for name, tok in file_tokens.items():
        basename = os.path.basename(name).lower()
        if basename in ("skill.md", "prompt.md", "instructions.md", "system_prompt.md"):
            if tok > PROMPT_TOKEN_HIGH:
                findings.append(
                    {
                        "rule": "prompt-size",
                        "severity": "high",
                        "confidence": 0.9,
                        "description": f'Prompt file "{name}" is ~{tok:,} tokens — exceeds {PROMPT_TOKEN_HIGH:,} token threshold',
                        "location": name,
                        "remediation": f"Trim to under {PROMPT_TOKEN_WARN:,} tokens for optimal loading cost",
                    }
                )
            elif tok > PROMPT_TOKEN_WARN:
                findings.append(
                    {
                        "rule": "prompt-size",
                        "severity": "medium",
                        "confidence": 0.85,
                        "description": f'Prompt file "{name}" is ~{tok:,} tokens — above {PROMPT_TOKEN_WARN:,} token recommendation',
                        "location": name,
                        "remediation": f"Consider trimming to under {PROMPT_TOKEN_WARN:,} tokens",
                    }
                )

    # Check total skill size
    if total_tokens > TOTAL_TOKEN_HIGH:
        findings.append(
            {
                "rule": "total-size",
                "severity": "high",
                "confidence": 0.85,
                "description": f"Total skill content is ~{total_tokens:,} tokens — exceeds {TOTAL_TOKEN_HIGH:,} token threshold",
                "location": temp_dir,
                "remediation": "Reduce total file sizes to lower per-invocation cost",
            }
        )
    elif total_tokens > TOTAL_TOKEN_WARN:
        findings.append(
            {
                "rule": "total-size",
                "severity": "medium",
                "confidence": 0.8,
                "description": f"Total skill content is ~{total_tokens:,} tokens — above {TOTAL_TOKEN_WARN:,} token recommendation",
                "location": temp_dir,
                "remediation": "Consider reducing file sizes to lower per-invocation cost",
            }
        )

    # Check tool count
    if tool_count > TOOL_COUNT_WARN:
        findings.append(
            {
                "rule": "tool-overhead",
                "severity": "medium",
                "confidence": 0.85,
                "description": f"{tool_count} tool definitions found. Each tool adds ~200-500 tokens of context overhead per invocation (~{tool_count * 300:,}+ extra tokens total).",
                "location": "manifest/config",
                "remediation": f"Consider reducing to {TOOL_COUNT_WARN} or fewer tools. Consolidate related tools or implement on-demand registration.",
            }
        )

    # Efficiency score: starts at 100, penalize for findings
    score = 100
    for f in findings:
        if f["severity"] == "high":
            score -= 15
        elif f["severity"] == "medium":
            score -= 8
        elif f["severity"] == "low":
            score -= 3
    score = max(0, min(100, score))

    # Comparison text
    avg_tokens = 20_000
    if total_tokens < avg_tokens * 0.5:
        comparison = f"{total_tokens:,} tokens — much smaller than avg (~{avg_tokens:,} tokens)"
    elif total_tokens < avg_tokens:
        comparison = f"{total_tokens:,} tokens — below average (avg is ~{avg_tokens:,} tokens)"
    elif total_tokens < avg_tokens * 1.5:
        comparison = f"{total_tokens:,} tokens — above average (avg is ~{avg_tokens:,} tokens)"
    else:
        comparison = f"{total_tokens:,} tokens — significantly above average (avg is ~{avg_tokens:,} tokens)"

    if total_tokens < 500:
        one_liner = "Lean and efficient. No meaningful improvements needed."
        what_this_means = "Low overhead — the AI loads this context quickly and cheaply. No action needed."
    elif total_tokens < 2000:
        one_liner = "Well-structured skill with minimal waste."
        what_this_means = "Reasonable overhead. The AI loads this context efficiently."
    elif total_tokens < 10000:
        one_liner = "Moderate size skill. Consider optimization opportunities."
        what_this_means = "This skill adds noticeable context load. Review for potential size reductions."
    else:
        one_liner = "Large skill. Optimization recommended to reduce per-invocation cost."
        what_this_means = "This skill is expensive to load on every turn. Consider splitting or trimming."

    grade = _compute_grade(score)

    return {
        "one_liner": one_liner,
        "grade": grade,
        "estimated_tokens": total_tokens,
        "comparison": comparison,
        "cost_per_use": cost,
        "what_this_means": what_this_means,
        "findings": findings,
        "summary": {
            "total_findings": len(findings),
            "estimated_tokens_per_invocation": total_tokens,
            "efficiency_score": score,
        },
    }


def stage_token_analyze(ingest_result: IngestResult) -> StageResult:
    """Run Stage T: Token Usage Analysis.

    Uses the tokenomics CLI if available, otherwise falls back to a
    built-in pure Python estimator.

    Args:
        ingest_result: Result from Stage 0

    Returns:
        StageResult with token findings (always status="passed" or "skipped")
    """
    start = time.monotonic()
    temp_dir = ingest_result.temp_dir

    # Guard: no temp dir
    if not temp_dir:
        return StageResult(stage="stageT", status="skipped", findings=[], duration_ms=0, error="No temp directory")

    # Guard: temp_dir must be a real directory
    if not os.path.isdir(temp_dir):
        return StageResult(
            stage="stageT",
            status="skipped",
            findings=[],
            duration_ms=int((time.monotonic() - start) * 1000),
            error="Temp directory does not exist",
        )

    # Try to find tokenomics CLI
    data = _try_run_tokenomics_cli(temp_dir)

    # Fallback: pure Python analysis
    if data is None:
        data = _run_pure_python_analysis(temp_dir)

    # Convert findings
    findings: list[Finding] = []
    raw_findings = data.get("findings", [])

    for f in raw_findings:
        severity = f.get("severity", "info")
        if severity not in ("critical", "high", "medium", "low", "info"):
            severity = "info"
        findings.append(
            Finding(
                stage="stageT",
                severity=severity,
                type=f.get("rule", "unknown"),
                description=f.get("description", ""),
                location=f.get("location"),
                confidence=f.get("confidence"),
                tool="token_analyzer",
                remediation=f.get("remediation"),
            )
        )

    # Add summary finding with efficiency metadata
    summary = data.get("summary", {})
    eff_score = summary.get("efficiency_score")
    est_tokens = summary.get("estimated_tokens_per_invocation")
    if eff_score is not None or est_tokens is not None:
        desc_parts = []
        if eff_score is not None:
            desc_parts.append(f"Efficiency score: {eff_score}/100")
        if est_tokens is not None:
            desc_parts.append(f"Estimated {est_tokens:,} tokens per invocation")
        findings.append(
            Finding(
                stage="stageT",
                severity="info",
                type="token_summary",
                description=". ".join(desc_parts) + ".",
                confidence=1.0,
                tool="token_analyzer",
                evidence=json.dumps(
                    {
                        "grade": data.get("grade"),
                        "efficiency_score": eff_score,
                        "estimated_tokens_per_invocation": est_tokens,
                        "estimated_tokens": data.get("estimated_tokens"),
                        "cost_per_use": data.get("cost_per_use"),
                        "total_findings": summary.get("total_findings", 0),
                    }
                ),
            )
        )

    return StageResult(
        stage="stageT",
        status="passed",  # Token findings never "fail"
        findings=findings,
        duration_ms=int((time.monotonic() - start) * 1000),
    )


def _try_run_tokenomics_cli(temp_dir: str) -> dict | None:
    """Try to run the tokenomics CLI. Returns parsed JSON or None."""
    tokenomics_bin = shutil.which("tokenomics")

    if not tokenomics_bin:
        # Check local node_modules/.bin (Vercel installs package.json deps)
        local_bin = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "node_modules", ".bin", "tokenomics"
        )
        if os.path.isfile(local_bin):
            tokenomics_bin = local_bin

    if not tokenomics_bin:
        return None

    # Version check
    try:
        ver_result = subprocess.run([tokenomics_bin, "--version"], capture_output=True, text=True, timeout=5)
        version_str = (ver_result.stdout or ver_result.stderr or "").strip()
        version_str = version_str.lower().replace("tokenomics", "").replace("v", "").strip()
        installed_parts = [int(p) for p in version_str.split(".") if p.isdigit()]
        min_parts = [int(p) for p in MIN_TOKENOMICS_VERSION.split(".")]
        if installed_parts < min_parts:
            return None
    except Exception:
        pass  # Try running anyway

    # Run analyze-skill
    try:
        result = subprocess.run(
            [tokenomics_bin, "--analyze-skill", temp_dir, "--json"],
            capture_output=True,
            text=True,
            timeout=TOKENOMICS_TIMEOUT,
        )
    except (subprocess.TimeoutExpired, Exception):
        return None

    if result.returncode != 0:
        logger.warning(f"tokenomics CLI exited with code {result.returncode}: {result.stderr[:200]}")
        return None

    try:
        return json.loads(result.stdout)
    except (json.JSONDecodeError, TypeError):
        return None
