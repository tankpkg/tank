"""Context-aware finding evaluation (Layer 1 fast-path).

Uses hardcoded rules to instantly resolve obvious findings:
- Declared permissions → downgrade
- Safe subprocess args → downgrade
- Standard env vars → downgrade
- Inside code blocks → downgrade
- Test/example files → downgrade
- Undeclared capabilities → escalate

Conservative: only downgrades when ALL applicable factors agree.
Returns (finding, is_resolved). Resolved findings skip LLM (Layer 2).
"""

import ast
import logging
import re
from typing import Any

from lib.scan.markdown_utils import get_code_block_language, is_inside_code_block, is_inside_heading
from lib.scan.models import Finding
from lib.scan.safe_patterns import is_build_file, is_safe_env_var, is_safe_subprocess_call, is_test_file

logger = logging.getLogger(__name__)

# Severity downgrade ranks
SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}


def _can_downgrade_to(current: str, target: str) -> bool:
    """Check if current severity can be downgraded to target."""
    return SEVERITY_RANK.get(target, 99) > SEVERITY_RANK.get(current, 99)


class ContextEvaluator:
    """Layer 1: Hardcoded fast-path for context-aware finding evaluation."""

    def __init__(self, permissions: dict[str, Any], manifest: dict[str, Any]):
        self.permissions = permissions
        self.manifest = manifest

        # Pre-extract declared permissions for fast lookup
        self._network_outbound = bool(permissions.get("network", {}).get("outbound"))
        self._subprocess_allowed = bool(permissions.get("subprocess", False))

    def evaluate(
        self,
        finding: Finding,
        source: str | None = None,
        file_meta: dict[str, Any] | None = None,
    ) -> tuple[Finding, bool]:
        """Evaluate a finding against context.

        Args:
            finding: The raw finding to evaluate.
            source: Full source content of the file (for markdown checks).
            file_meta: File metadata with keys like 'path', 'extension'.

        Returns:
            Tuple of (possibly modified finding, is_resolved).
            is_resolved=True means finding needs no LLM review.
        """
        file_path = file_meta.get("path", "") if file_meta else ""

        # Check escalation rules first (keep or raise severity)
        escalated, is_resolved = self._check_escalation(finding, file_path)
        if is_resolved:
            return escalated, True

        # Check downgrade rules
        downgraded, is_resolved = self._check_downgrade(finding, source, file_path)
        if is_resolved:
            return downgraded, True

        # Ambiguous — send to LLM
        return finding, False

    def _check_escalation(self, finding: Finding, file_path: str) -> tuple[Finding, bool]:
        """Check if finding should be escalated or kept at current severity.

        Returns (finding, is_resolved). If resolved, skip LLM.
        """
        # Undeclared network access
        if self._is_network_finding(finding) and not self._network_outbound:
            # Network access without permission — keep high or escalate
            if _can_downgrade_to("high", finding.severity):
                finding.severity = "high"
            return finding, True

        # Obfuscation + execution patterns — always critical
        if finding.type == "obfuscation" and "exec" in finding.description.lower():
            finding.severity = "critical"
            return finding, True

        return finding, False

    def _check_downgrade(
        self, finding: Finding, source: str | None, file_path: str
    ) -> tuple[Finding, bool]:
        """Check if finding should be downgraded based on context.

        Conservative: requires ALL applicable factors to agree.
        """
        # Rule 1: Declared permission match
        if self._permission_matches_finding(finding):
            finding.severity = "info"
            logger.debug(f"ContextEvaluator: downgraded {finding.type} to info (declared permission)")
            return finding, True

        # Rule 2: Inside markdown code block
        if source and finding.location:
            position = self._get_position_in_source(source, finding)
            if position is not None and is_inside_code_block(source, position):
                finding.severity = "info"
                logger.debug(f"ContextEvaluator: downgraded {finding.type} to info (inside code block)")
                return finding, True

        # Rule 3: On a heading line
        if source and finding.location:
            position = self._get_position_in_source(source, finding)
            if position is not None and is_inside_heading(source, position):
                # Headings are never instructions — skip entirely
                finding.severity = "info"
                logger.debug(f"ContextEvaluator: downgraded {finding.type} to info (heading)")
                return finding, True

        # Rule 4: Safe subprocess args
        if self._is_safe_subprocess_finding(finding):
            finding.severity = "low"
            logger.debug(f"ContextEvaluator: downgraded {finding.type} to low (safe subprocess args)")
            return finding, True

        # Rule 5: Safe environment variable access
        if self._is_safe_env_finding(finding):
            finding.severity = "info"
            logger.debug(f"ContextEvaluator: downgraded {finding.type} to info (safe env var)")
            return finding, True

        # Rule 6: Test/example file
        if file_path and is_test_file(file_path):
            finding.severity = "info"
            logger.debug(f"ContextEvaluator: downgraded {finding.type} to info (test file)")
            return finding, True

        # Rule 7: Build/config file — context-dependent, send to LLM
        if file_path and is_build_file(file_path):
            # Don't resolve — let LLM decide if the pattern is dangerous
            return finding, False

        return finding, False

    def _permission_matches_finding(self, finding: Finding) -> bool:
        """Check if the finding's behavior is covered by declared permissions."""
        # Network access with network.outbound declared
        if self._is_network_finding(finding) and self._network_outbound:
            return True

        # Subprocess with subprocess permission declared
        if finding.type in ("shell_injection", "subprocess_usage") and self._subprocess_allowed:
            return True

        return False

    def _is_network_finding(self, finding: Finding) -> bool:
        """Check if finding relates to network access."""
        return (
            finding.type in ("network_access", "undeclared_network")
            or "fetch" in finding.description.lower()
            or "request" in finding.description.lower()
            or "http" in finding.description.lower()
        )

    def _is_safe_subprocess_finding(self, finding: Finding) -> bool:
        """Check if finding is a subprocess call with safe literal args."""
        if finding.type not in ("shell_injection", "subprocess_usage", "js_pattern"):
            return False

        # Check evidence for safe command patterns
        evidence = finding.evidence or finding.description
        if not evidence:
            return False

        # Pattern: subprocess.call(["git", "status"]) or subprocess.run(["npm", "install"])
        safe_call_match = re.search(
            r'(?:subprocess\.\w+|child_process\.\w+)\s*\(\s*\[([^\]]+)\]',
            evidence,
        )
        if safe_call_match:
            args_str = safe_call_match.group(1)
            # Extract command (first string literal)
            cmd_match = re.search(r'["\'](\w+)["\']', args_str)
            if cmd_match and is_safe_subprocess_call(cmd_match.group(1)):
                return True

        # Shell scripts with safe commands
        for safe_cmd in ("git status", "git log", "npm install", "npm run", "npm test", "bun install", "node "):
            if safe_cmd in evidence.lower():
                return True

        return False

    def _is_safe_env_finding(self, finding: Finding) -> bool:
        """Check if finding is about accessing a safe environment variable."""
        if finding.type != "env_access":
            return False

        evidence = finding.evidence or finding.description
        if not evidence:
            return False

        # Check for process.env.SAFE_VAR or os.environ["SAFE_VAR"] or os.getenv("SAFE_VAR")
        env_match = re.search(
            r'(?:process\.env\.(\w+)|os\.environ\[?["\'](\w+)["\']\]?|os\.getenv\(["\'](\w+)["\']\))',
            evidence,
        )
        if env_match:
            var_name = env_match.group(1) or env_match.group(2) or env_match.group(3)
            if var_name and is_safe_env_var(var_name):
                return True

        return False

    def _get_position_in_source(self, source: str, finding: Finding) -> int | None:
        """Get character position of finding match in source content.

        Uses evidence text to find the position, or falls back to line-based.
        """
        if finding.evidence:
            pos = source.find(finding.evidence)
            if pos >= 0:
                return pos

        # Fallback: use location line number
        if finding.location and ":" in finding.location:
            try:
                _, line_str = finding.location.rsplit(":", 1)
                line_num = int(line_str)
                lines = source.split("\n")
                if 1 <= line_num <= len(lines):
                    return sum(len(lines[i]) + 1 for i in range(line_num - 1))
            except (ValueError, IndexError):
                pass

        return None
