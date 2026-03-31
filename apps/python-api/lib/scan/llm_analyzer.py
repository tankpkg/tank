"""LLM-based Security Finding Corroboration

Provides a corroboration layer for ambiguous regex findings using LLM analysis.
Supports multiple providers via OpenAI-compatible API (BYOLLM pattern).

Provider Priority:
1. Custom BYOLLM (LLM_API_KEY + LLM_BASE_URL + LLM_MODEL)
2. Built-in Groq (GROQ_API_KEY) - primary: 8b, secondary: 70b
3. Built-in OpenRouter (OPENROUTER_API_KEY) - Nemotron fallback

Safety: LLM can only downgrade severity, never upgrade. Deterministic
high-confidence patterns (weight=1.0, Claude format) bypass LLM entirely.
"""

import json
import logging
import os
import time
from pathlib import Path

import httpx

from lib.scan.llm_types import (
    DEFAULT_GROQ_70B_MODEL,
    DEFAULT_GROQ_8B_MODEL,
    DEFAULT_OPENROUTER_MODEL,
    DEFAULT_TIMEOUT_MS,
    LLM_SYSTEM_PROMPT,
    MAX_FINDINGS_PER_CALL,
    LLMAnalyzerResult,
    LLMProviderConfig,
    LLMVerdict,
)

from lib.scan.models import Finding

logger = logging.getLogger(__name__)


class LLMAnalyzer:
    """Analyzes ambiguous security findings using LLM corroboration."""

    # Pattern categories that should ALWAYS go to LLM (high false-positive rate)
    AMBIGUOUS_TYPES = {
        # Stage 3 (existing)
        "prompt_injection_pattern",  # Regex patterns with variable confidence
        "elevated_suspicion",  # Heuristic-based findings
        # Stage 2 (new — context-dependent, high false positive rate)
        "subprocess_usage",  # Could be safe (git) or dangerous (user input)
        "network_access",  # Depends on permission declaration
        "env_access",  # NODE_ENV is safe, DB_PASSWORD is suspicious
        "shell_injection",  # Subprocess with safe vs unsafe args
        "js_pattern",  # Generic JS pattern — needs context
    }

    # Pattern categories that should NEVER go to LLM (deterministic)
    DETERMINISTIC_TYPES = {
        "base64_in_comment",
        "hidden_instruction",
        "hidden_markdown_comment",
    }

    # Tool names that indicate high-confidence findings
    DETERMINISTIC_TOOLS = {
        "stage3_hidden",
    }

    def __init__(self):
        """Build provider chain from env vars (resolution priority order)."""
        self.providers: list[LLMProviderConfig] = []
        self._enabled: bool | None = None
        self._build_provider_chain()

    def _build_provider_chain(self) -> None:
        """Resolution: custom BYOLLM > Groq 8b > Groq 70b > OpenRouter Nemotron."""
        timeout_ms = int(os.environ.get("LLM_SCAN_TIMEOUT_MS", DEFAULT_TIMEOUT_MS))
        timeout_sec = timeout_ms / 1000.0

        # 1. Custom BYOLLM provider (highest priority)
        api_key = os.environ.get("LLM_API_KEY")
        base_url = os.environ.get("LLM_BASE_URL")
        if api_key and base_url:
            model = os.environ.get("LLM_MODEL", "gpt-4o-mini")
            self.providers.append(
                LLMProviderConfig(
                    name="custom",
                    base_url=base_url,
                    api_key=api_key,
                    model=model,
                    timeout_seconds=timeout_sec,
                )
            )
            logger.info(f"LLM analyzer: custom provider configured ({model})")

        # 2. Built-in Groq chain
        groq_key = os.environ.get("GROQ_API_KEY")
        if groq_key and not (api_key and base_url):
            groq_8b_model = os.environ.get("GROQ_8B_MODEL", DEFAULT_GROQ_8B_MODEL)
            groq_70b_model = os.environ.get("GROQ_70B_MODEL", DEFAULT_GROQ_70B_MODEL)
            self.providers.append(
                LLMProviderConfig(
                    name="groq_8b",
                    base_url="https://api.groq.com/openai/v1",
                    api_key=groq_key,
                    model=groq_8b_model,
                    timeout_seconds=min(5.0, timeout_sec),
                )
            )
            self.providers.append(
                LLMProviderConfig(
                    name="groq_70b",
                    base_url="https://api.groq.com/openai/v1",
                    api_key=groq_key,
                    model=groq_70b_model,
                    timeout_seconds=timeout_sec,
                )
            )
            logger.info(f"LLM analyzer: Groq providers configured ({groq_8b_model} primary, {groq_70b_model} fallback)")

        # 3. Built-in OpenRouter fallback
        or_key = os.environ.get("OPENROUTER_API_KEY")
        if or_key and not (api_key and base_url) and not groq_key:
            openrouter_model = os.environ.get("OPENROUTER_MODEL", DEFAULT_OPENROUTER_MODEL)
            self.providers.append(
                LLMProviderConfig(
                    name="openrouter_nemotron",
                    base_url="https://openrouter.ai/api/v1",
                    api_key=or_key,
                    model=openrouter_model,
                    timeout_seconds=timeout_sec,
                )
            )
            logger.info(f"LLM analyzer: OpenRouter provider configured ({openrouter_model})")

        if not self.providers:
            logger.info("LLM analyzer: no providers configured (regex-only mode)")

    @property
    def is_available(self) -> bool:
        """Check if any LLM provider is available."""
        if self._enabled is False:
            return False
        return len(self.providers) > 0

    @property
    def mode(self) -> str:
        """Return current mode: 'byollm', 'builtin', or 'disabled'."""
        if not self.providers:
            return "disabled"
        if self.providers[0].name == "custom":
            return "byollm"
        return "builtin"

    def is_enabled(self) -> bool:
        """Check if LLM scanning is enabled via env var or providers."""
        if self._enabled is not None:
            return self._enabled

        env_setting = os.environ.get("LLM_SCAN_ENABLED", "auto").lower()

        if env_setting == "false":
            self._enabled = False
            return False
        elif env_setting == "true":
            self._enabled = len(self.providers) > 0
            return self._enabled
        else:  # "auto"
            self._enabled = len(self.providers) > 0
            return self._enabled

    def should_send_to_llm(self, finding: Finding) -> bool:
        """Smart filter: only send ambiguous findings to LLM."""
        if finding.type in self.DETERMINISTIC_TYPES:
            return False
        if finding.tool in self.DETERMINISTIC_TOOLS:
            return False
        if finding.confidence and finding.confidence >= 0.95:
            return False

        # Direct override and Claude format patterns bypass LLM
        if finding.evidence:
            evidence_lower = finding.evidence.lower()
            bypass_patterns = [
                "ignore all previous", "ignore all instructions", "disregard all",
                "override system", "forget everything", "this is the real system",
                "<tool_use>", "<function_call", "<system>", "<antml:", "</antml:",
            ]
            if any(p in evidence_lower for p in bypass_patterns):
                return False

        return finding.type in self.AMBIGUOUS_TYPES or finding.confidence is None or finding.confidence < 0.95

    def filter_ambiguous_findings(self, findings: list[Finding]) -> tuple[list[Finding], list[Finding]]:
        """Split findings into ambiguous (send to LLM) and deterministic (keep as-is)."""
        ambiguous = []
        deterministic = []

        for finding in findings:
            if self.should_send_to_llm(finding):
                ambiguous.append(finding)
            else:
                deterministic.append(finding)

        logger.info(
            f"LLM filtering: {len(ambiguous)} ambiguous (to LLM), {len(deterministic)} deterministic (bypass LLM)"
        )
        if deterministic:
            logger.debug(f"Deterministic finding types: {{f.type for f in deterministic}}")

        return ambiguous, deterministic

    def _build_prompt(self, findings: list[Finding], temp_dir: str) -> str:
        """Build user prompt with finding snippets and context."""
        snippets = []

        for i, finding in enumerate(findings[:MAX_FINDINGS_PER_CALL]):
            context = self._get_finding_context(finding, temp_dir)
            snippets.append(f"""## Finding {i}
- Pattern: {finding.evidence or "N/A"}
- Type: {finding.type}
- Original Severity: {finding.severity}
- Original Confidence: {finding.confidence or 0}
- Location: {finding.location or "N/A"}
- Context:
```
{context}
```""")

        return f"""Analyze these {len(snippets)} flagged snippets from an MCP skill file:

{chr(10).join(snippets)}

Classify each finding and respond with ONLY a JSON array."""

    def _get_finding_context(self, finding: Finding, temp_dir: str) -> str:
        """Extract context around a finding from the file."""
        if not finding.location:
            return finding.evidence or "No context available"

        try:
            parts = finding.location.rsplit(":", 1)
            if len(parts) == 2:
                file_path, line_str = parts
                line_num = int(line_str)
            else:
                file_path = parts[0]
                line_num = 1

            full_path = Path(temp_dir) / file_path
            if not full_path.exists():
                return finding.evidence or "File not found"

            with open(full_path, encoding="utf-8", errors="replace") as f:
                lines = f.readlines()

            start = max(0, line_num - 4)
            end = min(len(lines), line_num + 3)

            context_lines = []
            for i in range(start, end):
                prefix = ">>> " if i == line_num - 1 else "    "
                context_lines.append(f"{prefix}{i + 1}: {lines[i].rstrip()}")

            return "\n".join(context_lines)

        except Exception as e:
            logger.debug(f"Could not get context for {finding.location}: {e}")
            return finding.evidence or "Context unavailable"

    async def _call_provider(self, provider: LLMProviderConfig, prompt: str, timeout_ms: int) -> str:
        """POST to OpenAI-compatible /chat/completions endpoint."""
        url = f"{provider.base_url.rstrip('/')}/chat/completions"

        headers = {
            "Authorization": f"Bearer {provider.api_key}",
            "Content-Type": "application/json",
        }

        if "openrouter" in provider.base_url.lower():
            headers["HTTP-Referer"] = "https://tankpkg.dev"
            headers["X-Title"] = "Tank Security Scanner"

        payload = {
            "model": provider.model,
            "messages": [
                {"role": "system", "content": LLM_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": provider.max_tokens,
            "temperature": provider.temperature,
        }

        timeout_sec = max(1.0, timeout_ms / 1000.0)

        async with httpx.AsyncClient(timeout=timeout_sec + 1.0) as client:
            response = await client.post(url, headers=headers, json=payload)

            if response.status_code == 429:
                raise httpx.HTTPStatusError("Rate limited (429)", request=None, response=response)

            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    def _parse_response(self, raw: str) -> list[LLMVerdict]:
        """Parse LLM JSON response into verdicts."""
        try:
            content = raw.strip()
            if content.startswith("```"):
                first_newline = content.find("\n")
                if first_newline != -1:
                    content = content[first_newline + 1:]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()

            data = json.loads(content)

            if not isinstance(data, list):
                logger.warning(f"LLM response is not a list: {type(data)}")
                return []

            verdicts = []
            for item in data:
                if not isinstance(item, dict):
                    continue

                classification = item.get("classification", "uncertain")
                if classification not in ["confirmed_threat", "likely_benign", "uncertain"]:
                    classification = "uncertain"

                verdicts.append(LLMVerdict(
                    finding_index=item.get("index", 0),
                    classification=classification,
                    confidence=max(0.0, min(1.0, float(item.get("confidence", 0.5)))),
                    reasoning=item.get("reasoning", ""),
                ))

            return verdicts

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse LLM response as JSON: {e}")
            return []
        except Exception as e:
            logger.warning(f"Unexpected error parsing LLM response: {e}")
            return []

    async def analyze_findings(
        self, findings: list[Finding], temp_dir: str, timeout_ms: int = DEFAULT_TIMEOUT_MS
    ) -> LLMAnalyzerResult:
        """Try each provider in chain. Return verdicts or empty list on total failure."""
        logger.info(
            f"LLM analyze_findings called: enabled={self.is_enabled()}, "
            f"mode={self.mode}, providers={len(self.providers)}"
        )

        if not self.is_enabled():
            logger.info("LLM analysis is disabled, returning empty verdicts")
            return LLMAnalyzerResult(verdicts=[], error="LLM analysis disabled")

        if not findings:
            return LLMAnalyzerResult(verdicts=[])

        prompt = self._build_prompt(findings, temp_dir)
        logger.info(f"LLM analysis starting: {len(findings)} ambiguous findings to review")
        logger.debug(f"Provider chain: {' -> '.join(p.name for p in self.providers)}")

        for provider in self.providers:
            try:
                start = time.monotonic()
                logger.info(f"Trying provider: {provider.name} ({provider.model})")

                raw = await self._call_provider(provider, prompt, timeout_ms)
                latency_ms = int((time.monotonic() - start) * 1000)
                verdicts = self._parse_response(raw)

                logger.info(
                    f"LLM response received: {latency_ms}ms, "
                    f"{sum(1 for v in verdicts if v.classification == 'likely_benign')} dismissed, "
                    f"{sum(1 for v in verdicts if v.classification == 'confirmed_threat')} confirmed, "
                    f"{sum(1 for v in verdicts if v.classification == 'uncertain')} uncertain"
                )

                return LLMAnalyzerResult(
                    verdicts=verdicts,
                    provider_used=f"{provider.name} ({provider.model})",
                    latency_ms=latency_ms,
                )

            except httpx.TimeoutException:
                logger.warning(f"Provider {provider.name} timed out, trying next")
            except httpx.HTTPStatusError as e:
                logger.warning(f"Provider {provider.name} error: {e}, trying next")
            except Exception as e:
                logger.error(f"Unexpected error with {provider.name}: {e}")

        logger.error("All LLM providers failed, falling back to regex-only findings")
        return LLMAnalyzerResult(verdicts=[], error="all_providers_failed")

    def apply_verdicts(self, findings: list[Finding], verdicts: list[LLMVerdict]) -> list[Finding]:
        """Adjust severity/confidence based on LLM verdicts. LLM can only downgrade, never upgrade."""
        if not verdicts:
            logger.info("No LLM verdicts to apply, returning original findings")
            return findings

        logger.info(f"Applying {len(verdicts)} LLM verdicts to {len(findings)} findings")
        verdict_map = {v.finding_index: v for v in verdicts}

        updated_findings = []
        for i, finding in enumerate(findings):
            verdict = verdict_map.get(i)
            if not verdict:
                updated_findings.append(finding)
                continue

            finding.llm_reviewed = True
            finding.llm_verdict = verdict.classification

            if finding.tool:
                if verdict.classification == "likely_benign":
                    finding.tool = f"{finding.tool}+llm_dismissed"
                elif verdict.classification == "confirmed_threat":
                    finding.tool = f"{finding.tool}+llm_confirmed"

            if verdict.classification == "likely_benign" and verdict.confidence > 0.8:
                original_severity = finding.severity
                if finding.severity == "critical":
                    finding.severity = "medium"
                elif finding.severity in ("high", "medium"):
                    finding.severity = "low"
                elif finding.severity == "low":
                    finding.severity = "info"
                    logger.info(
                        f"Finding {i} downgraded to info by LLM: {finding.type} "
                        f"(confidence={verdict.confidence:.2f}, reason={verdict.reasoning[:50]}...)"
                    )

                if finding.confidence:
                    finding.confidence = finding.confidence * 0.5

                logger.info(
                    f"Finding {i} downgraded: {original_severity} -> {finding.severity} "
                    f"({finding.type}, reason={verdict.reasoning[:50]}...)"
                )
            elif verdict.classification == "confirmed_threat":
                if finding.confidence:
                    finding.confidence = min(1.0, finding.confidence + 0.1)
                logger.info(f"Finding {i} confirmed as threat: {finding.type} (confidence={verdict.confidence:.2f})")
            else:
                logger.debug(f"Finding {i} uncertain: {finding.type} (confidence={verdict.confidence:.2f})")

            updated_findings.append(finding)

        downgraded = sum(1 for v in verdicts if v.classification == "likely_benign")
        confirmed = sum(1 for v in verdicts if v.classification == "confirmed_threat")
        uncertain = sum(1 for v in verdicts if v.classification == "uncertain")
        logger.info(
            f"LLM verdicts summary: {downgraded} downgraded, {confirmed} confirmed, "
            f"{uncertain} uncertain, {len(findings) - len(updated_findings)} removed"
        )

        return updated_findings
