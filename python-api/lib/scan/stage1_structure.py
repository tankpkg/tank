"""Stage 1: File & Structure Validation

Validates SKILL.md presence, checks for dangerous Unicode characters,
detects non-UTF-8 encoding, and flags hidden files.
"""

import time
import unicodedata
from pathlib import Path
from typing import Optional

from charset_normalizer import from_bytes

from lib.scan.models import Finding, IngestResult, StageResult

# Dangerous Unicode codepoints
ZERO_WIDTH_CHARS = {
    "\u200b",  # ZERO WIDTH SPACE
    "\u200c",  # ZERO WIDTH NON-JOINER
    "\u200d",  # ZERO WIDTH JOINER
    "\ufeff",  # ZERO WIDTH NO-BREAK SPACE (BOM)
}

BIDIRECTIONAL_OVERRIDES = {
    "\u202a",  # LEFT-TO-RIGHT EMBEDDING
    "\u202b",  # RIGHT-TO-LEFT EMBEDDING
    "\u202c",  # POP DIRECTIONAL FORMATTING
    "\u202d",  # LEFT-TO-RIGHT OVERRIDE
    "\u202e",  # RIGHT-TO-LEFT OVERRIDE
    "\u2066",  # LEFT-TO-RIGHT ISOLATE
    "\u2067",  # RIGHT-TO-LEFT ISOLATE
    "\u2068",  # FIRST STRONG ISOLATE
    "\u2069",  # POP DIRECTIONAL ISOLATE
}

# Cyrillic homoglyphs that look like Latin characters
CYRILLIC_HOMOGLYPHS = {
    "а": "a",  # Cyrillic a vs Latin a
    "е": "e",  # Cyrillic e vs Latin e
    "о": "o",  # Cyrillic o vs Latin o
    "р": "p",  # Cyrillic p vs Latin p
    "с": "c",  # Cyrillic c vs Latin c
    "х": "x",  # Cyrillic x vs Latin x
    "у": "y",  # Cyrillic y vs Latin y
    "А": "A",
    "В": "B",
    "Е": "E",
    "К": "K",
    "М": "M",
    "Н": "H",
    "О": "O",
    "Р": "P",
    "С": "C",
    "Т": "T",
    "Х": "X",
}

# Allowed hidden files (dotfiles)
ALLOWED_DOTFILES = {
    ".gitignore",
    ".editorconfig",
    ".prettierrc",
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.json",
    ".eslintrc.yaml",
    ".eslintrc.yml",
}

# Text file extensions to scan
TEXT_EXTENSIONS = {
    ".md", ".txt", ".rst",
    ".py", ".js", ".ts", ".mjs", ".cjs", ".jsx", ".tsx",
    ".sh", ".bash", ".zsh",
    ".json", ".yaml", ".yml", ".toml",
    ".csv",
}


def check_skill_md_exists(temp_dir: str) -> Optional[Finding]:
    """Check that SKILL.md exists in the root of the skill."""
    skill_md = Path(temp_dir) / "SKILL.md"
    if not skill_md.exists():
        return Finding(
            stage="stage1",
            severity="high",
            type="missing_skill_md",
            description="SKILL.md is missing from skill root directory",
            location="SKILL.md",
            confidence=1.0,
            tool="stage1_structure",
        )
    return None


def detect_dangerous_unicode(content: str, file_path: str) -> list[Finding]:
    """Detect dangerous Unicode characters in text content."""
    findings: list[Finding] = []

    lines = content.split("\n")
    for line_num, line in enumerate(lines, 1):
        for char in line:
            # Check bidirectional overrides
            if char in BIDIRECTIONAL_OVERRIDES:
                findings.append(Finding(
                    stage="stage1",
                    severity="critical",
                    type="bidirectional_override",
                    description=f"Bidirectional override character U+{ord(char):04X} detected",
                    location=f"{file_path}:{line_num}",
                    confidence=1.0,
                    tool="stage1_structure",
                    evidence=repr(char),
                ))

            # Check zero-width characters
            if char in ZERO_WIDTH_CHARS:
                findings.append(Finding(
                    stage="stage1",
                    severity="medium",
                    type="zero_width_char",
                    description=f"Zero-width character U+{ord(char):04X} detected",
                    location=f"{file_path}:{line_num}",
                    confidence=1.0,
                    tool="stage1_structure",
                    evidence=repr(char),
                ))

            # Check for Cyrillic homoglyphs in ASCII context
            if char in CYRILLIC_HOMOGLYPHS:
                # Check if surrounded by ASCII letters (suspicious context)
                idx = line.index(char) if char in line else -1
                if idx >= 0:
                    prev_ascii = idx > 0 and line[idx-1].isascii() and line[idx-1].isalpha()
                    next_ascii = idx < len(line)-1 and line[idx+1].isascii() and line[idx+1].isalpha()
                    if prev_ascii or next_ascii:
                        findings.append(Finding(
                            stage="stage1",
                            severity="high",
                            type="homoglyph",
                            description=f"Cyrillic homoglyph '{char}' (looks like '{CYRILLIC_HOMOGLYPHS[char]}') in ASCII context",
                            location=f"{file_path}:{line_num}",
                            confidence=0.8,
                            tool="stage1_structure",
                            evidence=repr(char),
                        ))

    return findings


def check_nfkc_normalization(content: str, file_path: str) -> Optional[Finding]:
    """Check if content changes under NFKC normalization (trick detection)."""
    normalized = unicodedata.normalize("NFKC", content)
    if normalized != content:
        # Find first difference
        for i, (orig, norm) in enumerate(zip(content, normalized)):
            if orig != norm:
                return Finding(
                    stage="stage1",
                    severity="medium",
                    type="nfkc_mismatch",
                    description=f"Content changes under NFKC normalization: '{orig}' -> '{norm}'",
                    location=f"{file_path}:{content[:i].count(chr(10)) + 1}",
                    confidence=0.7,
                    tool="stage1_structure",
                    evidence=f"U+{ord(orig):04X} -> U+{ord(norm):04X}",
                )
    return None


def check_encoding(file_path: str) -> Optional[Finding]:
    """Check if file is valid UTF-8."""
    try:
        with open(file_path, "rb") as f:
            raw = f.read()

        # Try UTF-8 first
        try:
            raw.decode("utf-8")
            return None
        except UnicodeDecodeError:
            pass

        # Use charset-normalizer to detect encoding
        result = from_bytes(raw)
        if result and result.best():
            encoding = result.best().encoding
            if encoding and encoding.lower() not in ("utf-8", "ascii"):
                return Finding(
                    stage="stage1",
                    severity="medium",
                    type="non_utf8_encoding",
                    description=f"File is not UTF-8 encoded (detected: {encoding})",
                    location=file_path,
                    confidence=0.9,
                    tool="stage1_structure",
                )
    except Exception:
        pass

    return None


def check_hidden_files(temp_dir: str, file_list: list[str]) -> list[Finding]:
    """Check for hidden dotfiles that aren't in the allowed list."""
    findings: list[Finding] = []

    for file_path in file_list:
        name = Path(file_path).name
        if name.startswith(".") and name not in ALLOWED_DOTFILES:
            # Check if it's a common config file pattern
            if not any(
                name.startswith(prefix)
                for prefix in [".env.", ".git", ".docker"]
            ):
                findings.append(Finding(
                    stage="stage1",
                    severity="low",
                    type="hidden_file",
                    description=f"Hidden dotfile detected: {name}",
                    location=file_path,
                    confidence=0.5,
                    tool="stage1_structure",
                ))

    return findings


def stage1_validate(ingest_result: IngestResult) -> StageResult:
    """Run Stage 1: File & Structure Validation.

    Checks:
    - SKILL.md presence
    - Dangerous Unicode characters (bidirectional, homoglyphs, zero-width)
    - NFKC normalization tricks
    - Non-UTF-8 encoding
    - Hidden dotfiles

    Args:
        ingest_result: Result from Stage 0 containing temp_dir and file_list

    Returns:
        StageResult with any findings
    """
    start = time.monotonic()
    findings: list[Finding] = []

    temp_dir = ingest_result.temp_dir
    if not temp_dir:
        return StageResult(
            stage="stage1",
            status="errored",
            findings=[Finding(
                stage="stage1",
                severity="critical",
                type="no_temp_dir",
                description="No temp directory from Stage 0",
                confidence=1.0,
                tool="stage1_structure",
            )],
            duration_ms=int((time.monotonic() - start) * 1000),
            error="Stage 0 did not provide temp directory",
        )

    # Check SKILL.md
    skill_md_finding = check_skill_md_exists(temp_dir)
    if skill_md_finding:
        findings.append(skill_md_finding)

    # Check each text file
    for file_path in ingest_result.file_list:
        ext = Path(file_path).suffix.lower()
        if ext not in TEXT_EXTENSIONS:
            continue

        full_path = Path(temp_dir) / file_path
        if not full_path.is_file():
            continue

        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()

            # Check for dangerous Unicode
            unicode_findings = detect_dangerous_unicode(content, file_path)
            findings.extend(unicode_findings)

            # Check NFKC normalization
            nfkc_finding = check_nfkc_normalization(content, file_path)
            if nfkc_finding:
                findings.append(nfkc_finding)

            # Check encoding (only if we haven't flagged non-UTF-8 yet)
            encoding_finding = check_encoding(str(full_path))
            if encoding_finding:
                findings.append(encoding_finding)

        except Exception as e:
            findings.append(Finding(
                stage="stage1",
                severity="low",
                type="file_read_error",
                description=f"Could not read file: {str(e)}",
                location=file_path,
                confidence=1.0,
                tool="stage1_structure",
            ))

    # Check hidden files
    hidden_findings = check_hidden_files(temp_dir, ingest_result.file_list)
    findings.extend(hidden_findings)

    # Determine status
    has_critical = any(f.severity == "critical" for f in findings)
    status = "failed" if has_critical else "passed"

    return StageResult(
        stage="stage1",
        status=status,
        findings=findings,
        duration_ms=int((time.monotonic() - start) * 1000),
    )
