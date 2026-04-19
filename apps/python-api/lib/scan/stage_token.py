"""Stage T: Token Usage Analysis (Pure Python)

Analyzes token efficiency of a skill package entirely in Python.
No subprocess, no Node.js, no external CLI — runs anywhere including Vercel Python Lambda.

Advisory-only — findings never affect the scan verdict.
"""

import json
import logging
import math
import os
import re
import time

from lib.scan.models import Finding, IngestResult, StageResult

logger = logging.getLogger(__name__)

CHARS_PER_TOKEN = 4

PROMPT_SIZE_MEDIUM = 2000
PROMPT_SIZE_HIGH = 4000

CLAUDE_MD_MEDIUM = 1500
CLAUDE_MD_HIGH = 3000

TOOL_MEDIUM = 8
TOOL_HIGH = 15
TOOL_SECTIONS = ["tools", "mcpServers", "mcp_servers", "serverTools", "server_tools"]
MANIFEST_FILES = ["tank.json", "skills.json"]

LINE_THRESHOLD = 500

DUPLICATION_THRESHOLD = 0.3
MIN_LINE_LENGTH = 20

SECTION_TOKEN_THRESHOLD = 500
LARGE_SECTION_THRESHOLD = 1000
FILE_TOKEN_BREAKDOWN_THRESHOLD = 1000

SONNET_INPUT_PER_M = 3
OPUS_INPUT_PER_M = 15
AVG_SKILL_TOKENS = 20000

SKILL_KNOWN_FILES = ["skill.md", "claude.md", "tank.json", "skills.json"]
SKILL_EXTENSIONS = {".md", ".json"}
SKIP_DIRS = {"node_modules", ".git", "dist"}

PROMPT_FILE_RE = [re.compile(r"^SKILL\.md$", re.IGNORECASE), re.compile(r"\.atom\.md$", re.IGNORECASE)]
SKILL_FILE_RE = [
    re.compile(r"SKILL\.md$", re.IGNORECASE),
    re.compile(r"\.atom\.md$", re.IGNORECASE),
    re.compile(r"CLAUDE\.md$", re.IGNORECASE),
]


# --- File Discovery ---


def _discover_skill_files(directory: str) -> dict[str, str]:
    """Walk directory, find .md/.json files, skip node_modules/.git/dist."""
    files: dict[str, str] = {}

    for dirpath, dirnames, filenames in os.walk(directory):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not os.path.islink(os.path.join(dirpath, d))]

        for fname in filenames:
            full_path = os.path.join(dirpath, fname)
            if os.path.islink(full_path):
                continue

            rel_path = os.path.relpath(full_path, directory)
            is_known = fname.lower() in SKILL_KNOWN_FILES
            is_atom = fname.lower().endswith(".atom.md")
            _, ext = os.path.splitext(fname)
            has_ext = ext.lower() in SKILL_EXTENSIONS

            if is_known or is_atom or has_ext:
                try:
                    with open(full_path, encoding="utf-8") as f:
                        files[rel_path] = f.read()
                except (OSError, UnicodeDecodeError):
                    pass

    return files


def _load_manifest(files: dict[str, str]) -> dict | None:
    """Load first found tank.json or skills.json from discovered files."""
    for manifest_name in MANIFEST_FILES:
        for filename, content in files.items():
            if filename.lower().endswith(manifest_name.lower()):
                try:
                    return json.loads(content)
                except (json.JSONDecodeError, ValueError):
                    pass
    return None


# --- Helper Functions ---


def _is_prompt_file(filename: str) -> bool:
    return any(p.search(filename) for p in PROMPT_FILE_RE)


def _is_skill_file(filename: str) -> bool:
    return any(p.search(filename) for p in SKILL_FILE_RE)


def _estimate_tokens(files: dict[str, str]) -> int:
    total_chars = sum(len(content) for content in files.values())
    return math.ceil(total_chars / CHARS_PER_TOKEN)


def _format_usd(amount: float) -> str:
    if amount < 0.001:
        return "<$0.001"
    if amount < 0.01:
        return f"~${amount:.3f}"
    return f"~${amount:.2f}"


def _estimate_cost(tokens: int) -> dict:
    token_millions = tokens / 1_000_000
    return {
        "sonnet_context_load": _format_usd(token_millions * SONNET_INPUT_PER_M),
        "opus_context_load": _format_usd(token_millions * OPUS_INPUT_PER_M),
        "token_count": tokens,
        "pricing_note": (
            f"Based on input pricing: ${SONNET_INPUT_PER_M}/M (Sonnet), "
            f"${OPUS_INPUT_PER_M}/M (Opus). Actual cost depends on how the skill "
            "is loaded, cache behavior, and session length."
        ),
    }


def _calculate_grade(score: int) -> str:
    if score >= 85:
        return "A"
    if score >= 65:
        return "B"
    if score >= 40:
        return "C"
    return "D"


def _calculate_efficiency_score(findings: list[dict], total_tokens: int) -> int:
    score = 100
    for f in findings:
        sev = f.get("severity", "info")
        if sev == "high":
            score -= 15
        elif sev == "medium":
            score -= 8
        elif sev == "low":
            score -= 3
        else:
            score -= 1
    if total_tokens < 1000:
        score = min(score + 10, 100)
    return max(0, min(100, score))


def _generate_one_liner(grade: str, tokens: int, findings_count: int) -> str:
    if grade == "A" and tokens < 5000:
        return "Lean and efficient. No meaningful improvements needed."
    if grade == "A":
        return "Well-structured skill with no significant waste."
    if grade == "B":
        if findings_count <= 2:
            return "Slightly above average size. Works fine, could be leaner."
        return "Good shape overall, with a few areas that could be tightened up."
    if grade == "C":
        return "Carries noticeable token overhead. Several sections could be trimmed or consolidated."
    return "Bloated — significant token waste. Multiple sections duplicate content or over-explain."


def _generate_comparison(tokens: int) -> str:
    ratio = tokens / AVG_SKILL_TOKENS
    t = f"{tokens:,}"
    avg = f"{AVG_SKILL_TOKENS:,}"
    if ratio < 0.3:
        return f"{t} tokens — much smaller than avg (~{avg} tokens)"
    if ratio < 0.7:
        return f"{t} tokens — below average (avg is ~{avg} tokens)"
    if ratio < 1.3:
        return f"{t} tokens — about average for a skill (~{avg} tokens)"
    if ratio < 2.0:
        return f"{t} tokens — above average (avg is ~{avg} tokens)"
    return f"{t} tokens — much larger than avg (~{avg} tokens)"


def _format_number(n: int) -> str:
    """Format integer with locale-style commas."""
    return f"{n:,}"


# --- Rule: prompt-size ---


def _rule_prompt_size(files: dict[str, str]) -> list[dict]:
    findings = []
    for filename, content in files.items():
        if not _is_prompt_file(filename):
            continue
        token_estimate = math.ceil(len(content) / CHARS_PER_TOKEN)
        if token_estimate > PROMPT_SIZE_HIGH:
            findings.append(
                {
                    "rule": "prompt-size",
                    "severity": "high",
                    "confidence": 0.95,
                    "description": (
                        f'Prompt file "{filename}" is ~{_format_number(token_estimate)} tokens '
                        f"({_format_number(len(content))} chars). "
                        "This loads into context on every skill invocation."
                    ),
                    "location": filename,
                    "remediation": (
                        f'Trim "{filename}" to under {PROMPT_SIZE_HIGH} tokens. '
                        "Move detailed examples, edge cases, or reference material to separate files "
                        "that are read on demand. Keep the core instructions concise."
                    ),
                }
            )
        elif token_estimate > PROMPT_SIZE_MEDIUM:
            findings.append(
                {
                    "rule": "prompt-size",
                    "severity": "medium",
                    "confidence": 0.9,
                    "description": (
                        f'Prompt file "{filename}" is ~{_format_number(token_estimate)} tokens '
                        f"({_format_number(len(content))} chars). "
                        "Consider trimming for faster invocations."
                    ),
                    "location": filename,
                    "remediation": (
                        f'Consider trimming "{filename}" to under {PROMPT_SIZE_MEDIUM} tokens. '
                        "Extract verbose examples or lengthy explanations into separate reference files."
                    ),
                }
            )
    return findings


# --- Rule: claude-md-size ---


def _extract_tokenomics_blocks(content: str) -> list[str]:
    blocks = []
    start_marker = "<!-- TOKENOMICS:START"
    end_marker = "<!-- TOKENOMICS:END"
    search_from = 0
    while search_from < len(content):
        start_idx = content.find(start_marker, search_from)
        if start_idx == -1:
            break
        end_idx = content.find(end_marker, start_idx)
        if end_idx == -1:
            break
        end_of_block = content.find("\n", end_idx)
        block_end = len(content) if end_of_block == -1 else end_of_block
        blocks.append(content[start_idx:block_end])
        search_from = block_end
    return blocks


def _flag_block(findings: list[dict], filename: str, token_estimate: int, block_description: str) -> None:
    if token_estimate > CLAUDE_MD_HIGH:
        findings.append(
            {
                "rule": "claude-md-size",
                "severity": "high",
                "confidence": 0.9,
                "description": (
                    f'{block_description} in "{filename}" is '
                    f"~{_format_number(token_estimate)} tokens. "
                    "This injects into every session's system prompt."
                ),
                "location": filename,
                "remediation": (
                    f'Reduce the {block_description} in "{filename}" to under {CLAUDE_MD_HIGH} tokens. '
                    "Use dynamic placeholders or move static content to files that are read on demand."
                ),
            }
        )
    elif token_estimate > CLAUDE_MD_MEDIUM:
        findings.append(
            {
                "rule": "claude-md-size",
                "severity": "medium",
                "confidence": 0.85,
                "description": (
                    f'{block_description} in "{filename}" is '
                    f"~{_format_number(token_estimate)} tokens. "
                    "Every session pays this context cost."
                ),
                "location": filename,
                "remediation": (
                    f'Trim the {block_description} in "{filename}" to under {CLAUDE_MD_MEDIUM} tokens. '
                    "Remove redundant instructions or consolidate overlapping guidance."
                ),
            }
        )


def _rule_claude_md_size(files: dict[str, str]) -> list[dict]:
    findings: list[dict] = []
    for filename, content in files.items():
        if "claude.md" not in filename.lower():
            continue
        tokenomics_blocks = _extract_tokenomics_blocks(content)
        if tokenomics_blocks:
            for block in tokenomics_blocks:
                token_est = math.ceil(len(block) / CHARS_PER_TOKEN)
                _flag_block(findings, filename, token_est, "tokenomics injection block")
            continue
        token_est = math.ceil(len(content) / CHARS_PER_TOKEN)
        _flag_block(findings, filename, token_est, "CLAUDE.md content")
    return findings


# --- Rule: tool-overhead ---


def _count_tools(manifest: dict | None, files: dict[str, str]) -> list[dict]:
    tools: list[dict] = []
    seen_names: set[str] = set()

    if manifest:
        for section in TOOL_SECTIONS:
            section_data = manifest.get(section)
            if not isinstance(section_data, dict) and not isinstance(section_data, list):
                continue
            if isinstance(section_data, list):
                for entry in section_data:
                    if isinstance(entry, dict) and "name" in entry:
                        name = str(entry["name"])
                        tools.append({"name": name, "source": "manifest"})
                        seen_names.add(name)
            else:
                for key in section_data:
                    tools.append({"name": key, "source": "manifest"})
                    seen_names.add(key)

    for filename, content in files.items():
        if filename not in MANIFEST_FILES and not filename.endswith(".json"):
            continue
        try:
            parsed = json.loads(content)
        except (json.JSONDecodeError, ValueError):
            continue
        for section in TOOL_SECTIONS:
            section_data = parsed.get(section)
            if isinstance(section_data, dict) and not isinstance(section_data, list):
                for key in section_data:
                    if key not in seen_names:
                        tools.append({"name": key, "source": filename})
                        seen_names.add(key)

    return tools


def _rule_tool_overhead(files: dict[str, str], manifest: dict | None) -> list[dict]:
    findings = []
    tools = _count_tools(manifest, files)
    tool_count = len(tools)

    if tool_count > TOOL_HIGH:
        findings.append(
            {
                "rule": "tool-overhead",
                "severity": "high",
                "confidence": 0.9,
                "description": (
                    f"{tool_count} tool definitions found. Each tool adds ~200-500 tokens of "
                    f"context overhead per invocation (~{tool_count * 200}-{tool_count * 500} extra tokens total)."
                ),
                "location": "manifest/config",
                "remediation": (
                    f"Reduce to {TOOL_HIGH} or fewer tools. Remove unused tools, or use "
                    "lazy-loading patterns where tools are only registered when the skill "
                    "enters a specific workflow."
                ),
            }
        )
    elif tool_count > TOOL_MEDIUM:
        findings.append(
            {
                "rule": "tool-overhead",
                "severity": "medium",
                "confidence": 0.85,
                "description": (
                    f"{tool_count} tool definitions found. Each tool adds ~200-500 tokens of "
                    f"context overhead per invocation (~{tool_count * 200}-{tool_count * 500} extra tokens total)."
                ),
                "location": "manifest/config",
                "remediation": (
                    f"Consider reducing to {TOOL_MEDIUM} or fewer tools. "
                    "Consolidate related tools or implement on-demand registration."
                ),
            }
        )
    return findings


# --- Rule: large-files ---


def _rule_large_files(files: dict[str, str]) -> list[dict]:
    findings = []
    for filename, content in files.items():
        line_count = len(content.split("\n"))
        if line_count > LINE_THRESHOLD:
            token_est = math.ceil(len(content) / CHARS_PER_TOKEN)
            findings.append(
                {
                    "rule": "large-files",
                    "severity": "medium" if line_count > 1000 else "low",
                    "confidence": 0.8,
                    "description": (
                        f'"{filename}" is {_format_number(line_count)} lines. '
                        f"Reading this file costs ~{_format_number(token_est)} tokens per invocation."
                    ),
                    "location": filename,
                    "remediation": (
                        f'Split "{filename}" into smaller, focused files. Use lazy-loading: '
                        "keep an index/summary file and load detailed sections only when needed."
                    ),
                }
            )
    return findings


# --- Rule: redundant-instructions ---


def _normalize_line(line: str) -> str:
    return re.sub(r"\s+", " ", line.lower().strip())


def _rule_redundant_instructions(files: dict[str, str]) -> list[dict]:
    findings = []
    file_lines: dict[str, list[str]] = {}

    for filename, content in files.items():
        if not _is_skill_file(filename):
            continue
        lines = [_normalize_line(line) for line in content.split("\n")]
        lines = [line for line in lines if len(line) >= MIN_LINE_LENGTH]
        file_lines[filename] = lines

    if len(file_lines) < 2:
        return findings

    line_file_count: dict[str, dict] = {}
    all_lines: list[str] = []

    for filename, lines in file_lines.items():
        for line in lines:
            all_lines.append(line)
            if line not in line_file_count:
                line_file_count[line] = {"count": 0, "files": []}
            entry = line_file_count[line]
            entry["count"] += 1
            if filename not in entry["files"]:
                entry["files"].append(filename)

    total_lines = len(all_lines)
    if total_lines == 0:
        return findings

    duplicated_lines = [(line, entry) for line, entry in line_file_count.items() if len(entry["files"]) >= 2]

    duplicated_count = 0
    for _, entry in duplicated_lines:
        duplicated_count += entry["count"] - math.ceil(entry["count"] / len(entry["files"]))

    duplication_rate = duplicated_count / total_lines

    if duplication_rate > DUPLICATION_THRESHOLD:
        examples = []
        for line, entry in duplicated_lines[:3]:
            truncated = line[:60] + ("..." if len(line) > 60 else "")
            examples.append(f'"{truncated}" in {", ".join(entry["files"])}')
        example_text = "\n    ".join(examples)

        findings.append(
            {
                "rule": "redundant-instructions",
                "severity": "medium" if duplication_rate > 0.5 else "low",
                "confidence": 0.75,
                "description": (
                    f"{round(duplication_rate * 100)}% of instruction lines are duplicated across "
                    f"skill files. {duplicated_count} of {total_lines} lines are redundant, "
                    "wasting tokens on every invocation."
                ),
                "location": ", ".join(file_lines.keys()),
                "remediation": (
                    "Consolidate shared instructions into a single file and reference it from others. "
                    f"Remove duplicated lines from individual files. Examples:\n    {example_text}"
                ),
            }
        )
    return findings


# --- Rule: section-analysis ---


def _parse_sections(content: str) -> list[dict]:
    lines = content.split("\n")
    sections: list[dict] = []
    current_heading = "(preamble)"
    current_level = 0
    current_line_start = 0
    current_lines: list[str] = []

    heading_re = re.compile(r"^(#{1,6})\s+(.+)$")

    for i, line in enumerate(lines):
        m = heading_re.match(line)
        if m:
            if current_lines or current_heading != "(preamble)":
                section_content = "\n".join(current_lines)
                sections.append(
                    {
                        "heading": current_heading,
                        "level": current_level,
                        "lineStart": current_line_start,
                        "content": section_content,
                        "tokens": math.ceil(len(section_content) / CHARS_PER_TOKEN),
                    }
                )
            current_heading = m.group(2).strip()
            current_level = len(m.group(1))
            current_line_start = i
            current_lines = []
        else:
            current_lines.append(line)

    last_content = "\n".join(current_lines)
    if last_content.strip() or current_heading != "(preamble)":
        sections.append(
            {
                "heading": current_heading,
                "level": current_level,
                "lineStart": current_line_start,
                "content": last_content,
                "tokens": math.ceil(len(last_content) / CHARS_PER_TOKEN),
            }
        )
    return sections


def _normalize_content(content: str) -> str:
    text = content.lower()
    text = re.sub(r"```[\s\S]*?```", "", text)
    text = re.sub(r"`[^`]+`", "", text)
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _jaccard_similarity(text_a: str, text_b: str) -> float:
    norm_a = _normalize_content(text_a)
    norm_b = _normalize_content(text_b)
    if len(norm_a) < 20 or len(norm_b) < 20:
        return 0.0
    words_a = {w for w in norm_a.split(" ") if len(w) > 3}
    words_b = {w for w in norm_b.split(" ") if len(w) > 3}
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    union = words_a | words_b
    return len(intersection) / len(union)


def _detect_redundancy(all_file_sections: list[dict]) -> list[dict]:
    all_sections = []
    for fs in all_file_sections:
        for s in fs["sections"]:
            all_sections.append({"file": fs["filename"], "section": s})

    links = []
    for i in range(len(all_sections)):
        a = all_sections[i]
        if a["section"]["tokens"] < 20:
            continue
        for j in range(i + 1, len(all_sections)):
            b = all_sections[j]
            if b["section"]["tokens"] < 20:
                continue
            similarity = _jaccard_similarity(a["section"]["content"], b["section"]["content"])
            if similarity > 0.25:
                links.append(
                    {
                        "sourceFile": a["file"],
                        "sourceSection": a["section"]["heading"],
                        "targetFile": b["file"],
                        "targetSection": b["section"]["heading"],
                        "similarity": similarity,
                    }
                )
    links.sort(key=lambda x: x["similarity"], reverse=True)
    return links


def _get_shortening_tip(section: dict) -> str | None:
    content = section["content"]
    lines = [line for line in content.split("\n") if line.strip()]
    tips: list[str] = []

    line_counts: dict[str, int] = {}
    for line in lines:
        norm = line.lower().strip()
        if len(norm) < 20:
            continue
        line_counts[norm] = line_counts.get(norm, 0) + 1
    repeated = [(k, v) for k, v in line_counts.items() if v > 1]
    if repeated:
        example = repeated[0][0][:60]
        tips.append(f'Contains {len(repeated)} repeated line(s), e.g. "{example}..."')

    code_block_count = len(re.findall(r"```", content)) // 2
    if code_block_count >= 2:
        tips.append(f"Has {code_block_count} code blocks \u2014 consider replacing examples with file references")

    list_items = [line for line in lines if re.match(r"^\s*[-*]\s", line) or re.match(r"^\s*\d+\.\s", line)]
    if len(list_items) > 8:
        tips.append(
            f"{len(list_items)} list items \u2014 consider grouping into categories or moving details to separate files"
        )

    table_rows = [line for line in lines if line.strip().startswith("|")]
    if len(table_rows) > 15:
        tips.append(
            f"{len(table_rows)} table rows \u2014 consider moving detailed tables "
            "to reference files and keeping only a summary"
        )

    normalized = _normalize_content(content)
    words = [w for w in normalized.split(" ") if len(w) > 2]
    phrase_min = 4
    phrase_counts: dict[str, int] = {}
    for i in range(len(words) - phrase_min):
        phrase = " ".join(words[i : i + phrase_min])
        phrase_counts[phrase] = phrase_counts.get(phrase, 0) + 1
    repeated_phrases = [(k, v) for k, v in phrase_counts.items() if v >= 3]
    if repeated_phrases:
        repeated_phrases.sort(key=lambda x: x[1], reverse=True)
        top = repeated_phrases[0]
        tips.append(
            f'Concept "{top[0][:50]}..." is restated {top[1]} times \u2014 state the rule once, reference it elsewhere'
        )

    restatement_patterns = [
        re.compile(r"remember.{0,10}(that|:)\s", re.IGNORECASE),
        re.compile(r"note.{0,5}(that|:)\s", re.IGNORECASE),
        re.compile(r"this (is|means)\s", re.IGNORECASE),
        re.compile(r"in other words", re.IGNORECASE),
        re.compile(r"that (is to say|means)\s", re.IGNORECASE),
        re.compile(r"this is (non-)?negotiable", re.IGNORECASE),
    ]
    restatement_count = 0
    for pattern in restatement_patterns:
        restatement_count += len(pattern.findall(content))
    if restatement_count >= 2:
        tips.append(
            f'{restatement_count} restatement(s) detected ("remember that", "note that", '
            '"in other words") \u2014 the AI already understood the first time; remove re-explanations'
        )

    bad_count = len(re.findall(r"\bbad\b|\bwrong\b|\bdon't\b|\bavoid\b|\bnever\b", content, re.IGNORECASE))
    good_count = len(re.findall(r"\bgood\b|\bcorrect\b|\bfixed\b|\binstead\b|\brather\b", content, re.IGNORECASE))
    if bad_count >= 3 and good_count >= 3:
        tips.append(
            f"Shows {bad_count} bad examples alongside good ones \u2014 consider showing only the "
            'correct pattern and stating the rule as a negative constraint (e.g. "never do X")'
        )

    specific_paths = re.findall(r"[\w/-]+\.\w{2,4}", content)
    unique_paths = {p.lower() for p in specific_paths}
    if len(unique_paths) > 6:
        tips.append(
            f"References {len(unique_paths)} specific file paths \u2014 consider replacing some "
            "with a glob pattern or naming convention rule"
        )

    justification_matches = re.findall(
        r"(this is important|the reason for|why\? because|this matters because|this is critical because)",
        content,
        re.IGNORECASE,
    )
    if len(justification_matches) >= 2:
        tips.append(
            f'{len(justification_matches)} justification(s) ("this is important because", '
            '"the reason for") \u2014 the AI follows instructions without needing persuasion; '
            "state the rule directly"
        )

    tree_line_count = 0
    for line in lines:
        if re.match(
            r"^[\u2500-\u257f\u2502\u2514\u250c\u2510\u2518\u251c\u2524\u252c\u2534\u253c\s]+[a-z]", line
        ) or re.match(r"^\s+[a-z_]+/\s*$", line, re.IGNORECASE):
            tree_line_count += 1
    if tree_line_count > 10:
        tips.append(
            f"Directory tree is {tree_line_count} lines \u2014 consider keeping only the "
            "top-level structure and linking to a reference file for the full tree"
        )

    return ". ".join(tips) + "." if tips else None


def _rule_section_analysis(files: dict[str, str]) -> list[dict]:
    findings: list[dict] = []

    prompt_file_sections: list[dict] = []
    reference_file_sections: list[dict] = []

    for filename, content in files.items():
        if not filename.lower().endswith(".md"):
            continue
        if not content.strip():
            continue
        sections = _parse_sections(content)
        if not sections:
            continue
        total_tokens = math.ceil(len(content) / CHARS_PER_TOKEN)
        entry = {"filename": filename, "sections": sections, "totalTokens": total_tokens}
        if _is_prompt_file(filename):
            prompt_file_sections.append(entry)
        elif "references/" in filename:
            reference_file_sections.append(entry)

    all_file_sections = prompt_file_sections + reference_file_sections
    redundancy_links = _detect_redundancy(all_file_sections)

    redundancy_lookup: dict[str, dict[str, list[dict]]] = {}
    for link in redundancy_links:
        for src_file, src_section, tgt_file, tgt_section in [
            (link["sourceFile"], link["sourceSection"], link["targetFile"], link["targetSection"]),
            (link["targetFile"], link["targetSection"], link["sourceFile"], link["sourceSection"]),
        ]:
            if src_file not in redundancy_lookup:
                redundancy_lookup[src_file] = {}
            file_map = redundancy_lookup[src_file]
            if src_section not in file_map:
                file_map[src_section] = []
            file_map[src_section].append({"file": tgt_file, "section": tgt_section})

    for entry in prompt_file_sections:
        filename = entry["filename"]
        sections = entry["sections"]
        total_tokens = entry["totalTokens"]
        file_redundancy = redundancy_lookup.get(filename, {})

        section_data = []
        for s in sections:
            peers = file_redundancy.get(s["heading"])
            peer_labels = None
            if peers:
                labels = list(
                    {
                        (f'"{p["section"]}"' if p["file"] == filename else f'{p["file"]} \u2192 "{p["section"]}"')
                        for p in peers
                    }
                )
                if labels:
                    peer_labels = labels
            section_data.append(
                {
                    "heading": s["heading"],
                    "level": s["level"],
                    "lineStart": s["lineStart"],
                    "tokens": s["tokens"],
                    "redundantWith": peer_labels,
                    "shorteningTip": _get_shortening_tip(s),
                }
            )

        large_sections = [s for s in sections if s["tokens"] > SECTION_TOKEN_THRESHOLD]
        redundant_sections = [s for s in sections if file_redundancy.get(s["heading"])]
        shortenable_sections = [s for i, s in enumerate(sections) if section_data[i]["shorteningTip"] is not None]
        has_large_file = total_tokens > FILE_TOKEN_BREAKDOWN_THRESHOLD

        if not has_large_file and not large_sections and not redundant_sections and not shortenable_sections:
            continue

        parts: list[str] = []
        if large_sections:
            top = max(large_sections, key=lambda s: s["tokens"])
            parts.append(f'Largest section "{top["heading"]}" is ~{_format_number(top["tokens"])} tokens')

        if redundant_sections:
            cross_file = [
                s
                for s in redundant_sections
                if any(p["file"] != filename for p in file_redundancy.get(s["heading"], []))
            ]
            if cross_file:
                parts.append(f"{len(cross_file)} section(s) duplicate content from reference files")
            within_file = [
                s
                for s in redundant_sections
                if any(p["file"] == filename for p in file_redundancy.get(s["heading"], []))
            ]
            if within_file:
                names = [f'"{s["heading"]}"' for s in within_file]
                parts.append(f"{len(within_file)} section(s) overlap each other: {', '.join(names)}")

        if shortenable_sections:
            parts.append(f"{len(shortenable_sections)} section(s) have shortening opportunities")

        max_tokens = max(s["tokens"] for s in sections) if sections else 0
        if max_tokens > LARGE_SECTION_THRESHOLD:
            severity = "high"
        elif large_sections:
            severity = "medium"
        elif redundant_sections:
            severity = "low"
        else:
            severity = "info"

        remediation_parts: list[str] = []
        for s in sorted(large_sections, key=lambda s: s["tokens"], reverse=True)[:3]:
            remediation_parts.append(
                f'"{s["heading"]}" ({s["tokens"]} tokens): split into smaller focused subsections '
                "or move details to separate files"
            )
        for s in redundant_sections[:3]:
            peers = file_redundancy.get(s["heading"], [])
            cross_peers = [p for p in peers if p["file"] != filename]
            same_peers = [p for p in peers if p["file"] == filename]
            if cross_peers:
                targets = ", ".join({f'{p["file"]} "{p["section"]}"' for p in cross_peers})
                remediation_parts.append(
                    f'"{s["heading"]}" duplicates content from {targets}: '
                    "keep it in one place, reference from the other"
                )
            if same_peers:
                targets = ", ".join({f'"{p["section"]}"' for p in same_peers})
                remediation_parts.append(
                    f'"{s["heading"]}" overlaps with {targets}: consolidate shared content into one section'
                )
        for s in shortenable_sections[:3]:
            idx = sections.index(s)
            tip = section_data[idx]["shorteningTip"]
            remediation_parts.append(f'"{s["heading"]}": {tip}')

        top_sections = sorted(sections, key=lambda s: s["tokens"], reverse=True)[:5]
        breakdown = ", ".join(f'"{s["heading"]}": {s["tokens"]}' for s in top_sections)

        if parts:
            description = (
                f"{filename}: {'. '.join(parts)}. "
                f"Total: ~{_format_number(total_tokens)} tokens across {len(sections)} sections "
                f"(top: {breakdown})"
            )
        else:
            description = (
                f"{filename}: ~{_format_number(total_tokens)} tokens across {len(sections)} sections. "
                f"Token breakdown: {breakdown}"
            )

        findings.append(
            {
                "rule": "section-analysis",
                "severity": severity,
                "confidence": 0.8,
                "description": description,
                "location": filename,
                "remediation": (
                    "\n".join(remediation_parts)
                    if remediation_parts
                    else "No shortening opportunities detected \u2014 structure looks efficient."
                ),
            }
        )

    return findings


# --- Main Analyzer ---


def _analyze_skill(directory: str) -> dict:
    """Run all 6 rules against discovered skill files, return analysis dict."""
    files = _discover_skill_files(directory)
    manifest = _load_manifest(files)

    all_findings: list[dict] = []
    all_findings.extend(_rule_prompt_size(files))
    all_findings.extend(_rule_claude_md_size(files))
    all_findings.extend(_rule_tool_overhead(files, manifest))
    all_findings.extend(_rule_large_files(files))
    all_findings.extend(_rule_redundant_instructions(files))
    all_findings.extend(_rule_section_analysis(files))

    estimated_tokens = _estimate_tokens(files)
    efficiency_score = _calculate_efficiency_score(all_findings, estimated_tokens)
    grade = _calculate_grade(efficiency_score)

    summary = {
        "total_findings": len(all_findings),
        "estimated_tokens_per_invocation": estimated_tokens,
        "efficiency_score": efficiency_score,
    }

    return {
        "one_liner": _generate_one_liner(grade, estimated_tokens, len(all_findings)),
        "grade": grade,
        "estimated_tokens": estimated_tokens,
        "comparison": _generate_comparison(estimated_tokens),
        "cost_per_use": _estimate_cost(estimated_tokens),
        "findings": all_findings,
        "summary": summary,
    }


# --- Stage Entry Point ---


def stage_token_analyze(ingest_result: IngestResult) -> StageResult:
    """Run Stage T: Token Usage Analysis.

    Pure Python implementation — no subprocess, no Node.js required.
    Analyzes token consumption per invocation and flags inefficient
    prompt sizes or file structures.

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

    data = _analyze_skill(temp_dir)

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
