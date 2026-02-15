"""Stage 2: Static Code Analysis

Runs Bandit on Python files, custom AST analysis for dangerous patterns,
regex patterns for JS/TS, and purpose cross-check against declared permissions.
"""

import ast
import re
import time
from pathlib import Path
from typing import Any

from .models import Finding, IngestResult, StageResult

# Python extensions to scan
PYTHON_EXTENSIONS = {".py"}

# JS/TS extensions to scan
JS_EXTENSIONS = {".js", ".ts", ".mjs", ".cjs", ".jsx", ".tsx"}

# Shell extensions
SHELL_EXTENSIONS = {".sh", ".bash", ".zsh"}

# Dangerous API patterns for Python (AST-based)
DANGEROUS_PYTHON_PATTERNS = {
    # Shell injection
    "shell_injection": {
        "functions": [
            ("os", "system"),
            ("os", "popen"),
            ("subprocess", "call"),
            ("subprocess", "run"),
            ("subprocess", "Popen"),
        ],
        "severity": "critical",
        "description": "Shell command execution - potential injection risk",
    },
    # Dynamic code execution
    "code_execution": {
        "functions": [
            ("builtins", "eval"),
            ("builtins", "exec"),
            ("builtins", "compile"),
        ],
        "severity": "critical",
        "description": "Dynamic code execution",
    },
    # Insecure deserialization
    "insecure_deserialize": {
        "functions": [
            ("pickle", "loads"),
            ("pickle", "load"),
            ("marshal", "loads"),
            ("shelve", "open"),
        ],
        "severity": "critical",
        "description": "Insecure deserialization",
    },
    # Environment access
    "env_access": {
        "functions": [
            ("os", "environ"),
            ("os", "getenv"),
        ],
        "severity": "medium",
        "description": "Environment variable access",
    },
    # Network access
    "network_access": {
        "functions": [
            ("requests", "get"),
            ("requests", "post"),
            ("requests", "put"),
            ("requests", "delete"),
            ("httpx", "get"),
            ("httpx", "post"),
            ("urllib.request", "urlopen"),
            ("socket", "connect"),
        ],
        "severity": "high",
        "description": "Network request - potential data exfiltration",
    },
}

# Regex patterns for JS/TS
JS_DANGEROUS_PATTERNS = [
    # Code execution
    (r"\beval\s*\(", "critical", "eval() usage - code injection risk"),
    (r"\bFunction\s*\(", "critical", "Function() constructor - code injection risk"),
    (r"new\s+Function\s*\(", "critical", "new Function() - code injection risk"),

    # Child process
    (r"child_process\.exec\s*\(", "critical", "child_process.exec() - shell injection"),
    (r"child_process\.spawn\s*\(.*shell\s*:\s*true", "critical", "spawn with shell:true"),
    (r"require\s*\(\s*['\"]child_process['\"]\s*\)", "high", "child_process imported"),

    # Network
    (r"\bfetch\s*\(", "high", "fetch() - network request"),
    (r"\bXMLHttpRequest\s*\(", "high", "XMLHttpRequest - network request"),
    (r"require\s*\(\s*['\"]https?['\"]\s*\)", "high", "http/https module imported"),

    # Environment
    (r"process\.env\b", "medium", "process.env access"),
    (r"require\s*\(\s*['\"]dotenv['\"]\s*\)", "medium", "dotenv imported"),

    # Filesystem
    (r"fs\.readFileSync\s*\(\s*['\"].*(?:\.ssh|\.aws|\.env|\.config)", "critical", "Sensitive file read"),
    (r"fs\.readFile\s*\(\s*['\"].*(?:\.ssh|\.aws|\.env|\.config)", "critical", "Sensitive file read"),
]

# Regex patterns for shell scripts
SHELL_DANGEROUS_PATTERNS = [
    (r"curl\s+[^|]*\|\s*(?:bash|sh)", "critical", "curl | bash pattern - remote code execution"),
    (r"wget\s+[^|]*\|\s*(?:bash|sh)", "critical", "wget | bash pattern - remote code execution"),
    (r"chmod\s+777", "high", "chmod 777 - overly permissive"),
    (r"chmod\s+\+x", "medium", "chmod +x - making file executable"),
    (r"eval\s+", "critical", "eval usage in shell"),
    (r"\bexport\s+\w+\s*=\s*\$", "medium", "Environment variable export"),
]

# Sensitive paths to watch for
SENSITIVE_PATHS = [
    ".ssh", ".aws", ".config", ".env",
    "/etc/passwd", "/etc/shadow",
    ".bashrc", ".zshrc", ".profile",
]


class PythonASTAnalyzer(ast.NodeVisitor):
    """AST visitor to detect dangerous patterns in Python code."""

    def __init__(self, file_path: str):
        self.file_path = file_path
        self.findings: list[Finding] = []
        self.imports: dict[str, str] = {}  # alias -> module

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            name = alias.asname or alias.name
            self.imports[name] = alias.name
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        if node.module:
            for alias in node.names:
                name = alias.asname or alias.name
                self.imports[name] = f"{node.module}.{alias.name}"
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        self._check_call(node)
        self.generic_visit(node)

    def _check_call(self, node: ast.Call) -> None:
        """Check if this function call matches a dangerous pattern."""
        # Get the function name
        func_name = self._get_func_name(node)
        if not func_name:
            return

        # Check against dangerous patterns
        for pattern_type, pattern_info in DANGEROUS_PYTHON_PATTERNS.items():
            for module, func in pattern_info["functions"]:
                # Check direct call: eval(...)
                if func_name == func and module == "builtins":
                    self._add_finding(node, pattern_type, pattern_info, func)
                    return

                # Check module call: os.system(...)
                if func_name == f"{module}.{func}" or func_name == func:
                    # Verify the import
                    parts = func_name.split(".")
                    if len(parts) >= 2:
                        imported_as = parts[0]
                        if imported_as in self.imports:
                            actual_module = self.imports[imported_as]
                            if actual_module.split(".")[0] == module.split(".")[0]:
                                self._add_finding(node, pattern_type, pattern_info, func_name)
                                return

    def _get_func_name(self, node: ast.Call) -> str | None:
        """Extract function name from Call node."""
        if isinstance(node.func, ast.Name):
            return node.func.id
        elif isinstance(node.func, ast.Attribute):
            # Handle chained attributes: os.path.exists
            parts = []
            current = node.func
            while isinstance(current, ast.Attribute):
                parts.append(current.attr)
                current = current.value
            if isinstance(current, ast.Name):
                parts.append(current.id)
            return ".".join(reversed(parts))
        return None

    def _add_finding(
        self,
        node: ast.Call,
        pattern_type: str,
        pattern_info: dict,
        func_name: str
    ) -> None:
        """Add a finding for a dangerous function call."""
        self.findings.append(Finding(
            stage="stage2",
            severity=pattern_info["severity"],
            type=pattern_type,
            description=f"{pattern_info['description']}: {func_name}()",
            location=f"{self.file_path}:{node.lineno}",
            confidence=0.9,
            tool="stage2_ast",
        ))


def run_bandit_scan(temp_dir: str, python_files: list[str]) -> list[Finding]:
    """Run Bandit security linter on Python files."""
    findings: list[Finding] = []

    try:
        from bandit.core import manager as b_manager
        from bandit.core import config as b_config

        # Initialize Bandit manager
        b_mgr = b_manager.BanditManager(
            b_config.BanditConfig(),
            "file",
        )

        # Build list of absolute paths
        abs_paths = [str(Path(temp_dir) / f) for f in python_files]

        # Run Bandit
        b_mgr.discover_files(abs_paths, False, False)
        b_mgr.run_tests()

        # Extract results
        results = b_mgr.get_issue_list()

        severity_map = {"HIGH": "high", "MEDIUM": "medium", "LOW": "low"}

        for issue in results:
            severity = severity_map.get(issue.severity, "medium")

            # Promote certain issues to critical
            if issue.test_id in ("B102", "B307"):  # exec, eval
                severity = "critical"

            findings.append(Finding(
                stage="stage2",
                severity=severity,
                type=f"bandit_{issue.test_id}",
                description=issue.text,
                location=f"{issue.fname}:{issue.lineno}",
                confidence=issue.confidence / 100.0 if issue.confidence else 0.8,
                tool="bandit",
            ))

    except ImportError:
        # Bandit not available, skip
        pass
    except Exception as e:
        findings.append(Finding(
            stage="stage2",
            severity="low",
            type="bandit_error",
            description=f"Bandit scan failed: {str(e)}",
            confidence=0.5,
            tool="stage2_static",
        ))

    return findings


def analyze_python_file(temp_dir: str, file_path: str) -> list[Finding]:
    """Analyze a single Python file for dangerous patterns."""
    findings: list[Finding] = []

    full_path = Path(temp_dir) / file_path
    try:
        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            source = f.read()

        # Parse AST
        try:
            tree = ast.parse(source, filename=str(full_path))
        except SyntaxError:
            return findings  # Skip files with syntax errors

        # Run AST analyzer
        analyzer = PythonASTAnalyzer(file_path)
        analyzer.visit(tree)
        findings.extend(analyzer.findings)

        # Check for obfuscation patterns in source
        obfuscation_findings = detect_obfuscation(source, file_path)
        findings.extend(obfuscation_findings)

    except Exception as e:
        findings.append(Finding(
            stage="stage2",
            severity="low",
            type="analysis_error",
            description=f"Could not analyze Python file: {str(e)}",
            location=file_path,
            confidence=0.5,
            tool="stage2_static",
        ))

    return findings


def detect_obfuscation(source: str, file_path: str) -> list[Finding]:
    """Detect obfuscation patterns in source code."""
    findings: list[Finding] = []

    # Check for base64 + exec pattern
    if re.search(r"base64\.b64decode\s*\([^)]*\).*exec\s*\(", source, re.DOTALL):
        findings.append(Finding(
            stage="stage2",
            severity="critical",
            type="obfuscation",
            description="Base64 decode followed by exec - obfuscated code execution",
            location=file_path,
            confidence=0.9,
            tool="stage2_obfuscation",
        ))

    # Check for ROT13
    if re.search(r"codecs\.decode\s*\([^,]+,\s*['\"]rot13['\"]", source):
        findings.append(Finding(
            stage="stage2",
            severity="high",
            type="obfuscation",
            description="ROT13 encoding detected - potential obfuscation",
            location=file_path,
            confidence=0.7,
            tool="stage2_obfuscation",
        ))

    return findings


def analyze_js_file(temp_dir: str, file_path: str) -> list[Finding]:
    """Analyze a JS/TS file for dangerous patterns using regex."""
    findings: list[Finding] = []

    full_path = Path(temp_dir) / file_path
    try:
        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            source = f.read()

        lines = source.split("\n")

        for pattern, severity, description in JS_DANGEROUS_PATTERNS:
            for line_num, line in enumerate(lines, 1):
                if re.search(pattern, line):
                    findings.append(Finding(
                        stage="stage2",
                        severity=severity,
                        type="js_pattern",
                        description=description,
                        location=f"{file_path}:{line_num}",
                        confidence=0.8,
                        tool="stage2_js_regex",
                    ))

    except Exception as e:
        findings.append(Finding(
            stage="stage2",
            severity="low",
            type="analysis_error",
            description=f"Could not analyze JS file: {str(e)}",
            location=file_path,
            confidence=0.5,
            tool="stage2_static",
        ))

    return findings


def analyze_shell_file(temp_dir: str, file_path: str) -> list[Finding]:
    """Analyze a shell script for dangerous patterns."""
    findings: list[Finding] = []

    full_path = Path(temp_dir) / file_path
    try:
        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            source = f.read()

        lines = source.split("\n")

        for pattern, severity, description in SHELL_DANGEROUS_PATTERNS:
            for line_num, line in enumerate(lines, 1):
                if re.search(pattern, line):
                    findings.append(Finding(
                        stage="stage2",
                        severity=severity,
                        type="shell_pattern",
                        description=description,
                        location=f"{file_path}:{line_num}",
                        confidence=0.8,
                        tool="stage2_shell_regex",
                    ))

    except Exception as e:
        findings.append(Finding(
            stage="stage2",
            severity="low",
            type="analysis_error",
            description=f"Could not analyze shell file: {str(e)}",
            location=file_path,
            confidence=0.5,
            tool="stage2_static",
        ))

    return findings


def cross_check_permissions(
    findings: list[Finding],
    permissions: dict[str, Any],
    manifest: dict[str, Any]
) -> list[Finding]:
    """Check if code capabilities match declared permissions."""
    additional_findings: list[Finding] = []

    # Check for network usage without network permission
    network_findings = [f for f in findings if f.type in ("network_access", "js_pattern") and
                       any(p in f.description for p in ["fetch", "request", "http", "XMLHttpRequest"])]

    if network_findings:
        network_perms = permissions.get("network", {})
        outbound = network_perms.get("outbound", [])
        if not outbound:
            additional_findings.append(Finding(
                stage="stage2",
                severity="high",
                type="undeclared_network",
                description="Code makes network requests but no network.outbound permission declared",
                confidence=0.8,
                tool="stage2_permission_check",
            ))

    # Check for subprocess usage without subprocess permission
    subprocess_findings = [f for f in findings if "shell" in f.type.lower() or
                          "subprocess" in f.description.lower() or
                          "child_process" in f.description.lower()]

    if subprocess_findings and not permissions.get("subprocess", False):
        additional_findings.append(Finding(
            stage="stage2",
            severity="high",
            type="undeclared_subprocess",
            description="Code runs subprocesses but subprocess permission is false/undeclared",
            confidence=0.8,
            tool="stage2_permission_check",
        ))

    return additional_findings


def stage2_analyze(
    ingest_result: IngestResult,
    manifest: dict[str, Any],
    permissions: dict[str, Any]
) -> StageResult:
    """Run Stage 2: Static Code Analysis.

    Runs Bandit on Python files, custom AST analysis, regex patterns for JS/TS,
    and cross-checks against declared permissions.

    Args:
        ingest_result: Result from Stage 0
        manifest: Skill manifest from database
        permissions: Declared permissions from database

    Returns:
        StageResult with findings
    """
    start = time.monotonic()
    findings: list[Finding] = []

    temp_dir = ingest_result.temp_dir
    if not temp_dir:
        return StageResult(
            stage="stage2",
            status="errored",
            findings=[Finding(
                stage="stage2",
                severity="critical",
                type="no_temp_dir",
                description="No temp directory from Stage 0",
                confidence=1.0,
                tool="stage2_static",
            )],
            duration_ms=int((time.monotonic() - start) * 1000),
            error="Stage 0 did not provide temp directory",
        )

    # Categorize files
    python_files: list[str] = []
    js_files: list[str] = []
    shell_files: list[str] = []

    for file_path in ingest_result.file_list:
        ext = Path(file_path).suffix.lower()
        if ext in PYTHON_EXTENSIONS:
            python_files.append(file_path)
        elif ext in JS_EXTENSIONS:
            js_files.append(file_path)
        elif ext in SHELL_EXTENSIONS:
            shell_files.append(file_path)

    # Run Bandit on Python files
    if python_files:
        bandit_findings = run_bandit_scan(temp_dir, python_files)
        findings.extend(bandit_findings)

    # Analyze Python files with custom AST
    for py_file in python_files:
        py_findings = analyze_python_file(temp_dir, py_file)
        findings.extend(py_findings)

    # Analyze JS/TS files
    for js_file in js_files:
        js_findings = analyze_js_file(temp_dir, js_file)
        findings.extend(js_findings)

    # Analyze shell files
    for sh_file in shell_files:
        sh_findings = analyze_shell_file(temp_dir, sh_file)
        findings.extend(sh_findings)

    # Cross-check against permissions
    permission_findings = cross_check_permissions(findings, permissions, manifest)
    findings.extend(permission_findings)

    # Determine status
    has_critical = any(f.severity == "critical" for f in findings)
    status = "failed" if has_critical else "passed"

    return StageResult(
        stage="stage2",
        status=status,
        findings=findings,
        duration_ms=int((time.monotonic() - start) * 1000),
    )
