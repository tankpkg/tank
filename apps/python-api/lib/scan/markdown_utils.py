"""Markdown structure utilities for context-aware scanning.

Helps the scanner distinguish between executable code, documentation text,
code examples, and structural elements in markdown files.
"""

import re
from dataclasses import dataclass


@dataclass
class CodeBlock:
    """A fenced code block range in a markdown file."""

    start: int  # Character offset of opening fence
    end: int  # Character offset of closing fence (or end of content)
    language: str  # Language identifier (e.g. "python", "javascript", "")


def _find_code_blocks(content: str) -> list[CodeBlock]:
    """Find all fenced code blocks in markdown content.

    Handles both ``` and ~~~ delimiters per CommonMark spec.
    Closing fence must match opening fence character and have no language tag.
    """
    blocks: list[CodeBlock] = []

    # Match fenced code blocks: ```lang or ~~~lang
    fence_pattern = re.compile(r"^( {0,3})(`{3,}|~{3,})\s*(\w*)\s*$", re.MULTILINE)

    openings: list[tuple[int, str, str, re.Match]] = []  # (position, fence_char, language, match)

    for match in fence_pattern.finditer(content):
        fence_char = match.group(2)[0]
        lang = match.group(3) or ""

        if openings and openings[-1][1] == fence_char and not lang:
            # Closing fence — must match opening char and have no language tag
            open_pos, _, open_lang, _ = openings.pop()
            blocks.append(CodeBlock(start=open_pos, end=match.end(), language=open_lang))
        else:
            # Opening fence (has language tag or unmatched fence char)
            openings.append((match.start(), fence_char, lang, match))

    # Unclosed blocks extend to end of content
    for open_pos, _, lang, _ in openings:
        blocks.append(CodeBlock(start=open_pos, end=len(content), language=lang))

    return blocks


def is_inside_code_block(content: str, position: int) -> bool:
    """Check if a character position falls inside a fenced code block.

    Args:
        content: Full file content.
        position: Character offset to check.

    Returns:
        True if position is between ``` or ~~~ fences.
    """
    blocks = _find_code_blocks(content)
    return any(b.start <= position <= b.end for b in blocks)


def is_inside_html_comment(content: str, position: int) -> bool:
    """Check if a character position falls inside an HTML comment.

    Handles both <!-- ... --> comments spanning single or multiple lines.

    Args:
        content: Full file content.
        position: Character offset to check.

    Returns:
        True if position is inside an HTML comment.
    """
    # Find the nearest opening comment before position
    open_idx = content.rfind("<!--", 0, position)
    if open_idx == -1:
        return False
    # Find the closing comment after the opening
    close_idx = content.find("-->", open_idx + 4)
    if close_idx == -1:
        # Unclosed comment extends to end of content
        return True
    return position <= close_idx + 2


def is_inside_heading(content: str, position: int) -> bool:
    """Check if a character position is on a markdown heading line.

    Args:
        content: Full file content.
        position: Character offset to check.

    Returns:
        True if position falls on a line starting with #.
    """
    # Find line start
    line_start = content.rfind("\n", 0, position) + 1
    line = content[line_start : position + 50]  # Look ahead a bit
    return line.lstrip().startswith("#")


def get_surrounding_context(content: str, position: int, lines: int = 3) -> str:
    """Get surrounding lines of text around a position.

    Args:
        content: Full file content.
        position: Character offset of the match.
        lines: Number of lines before and after to include.

    Returns:
        String with surrounding context lines.
    """
    all_lines = content.split("\n")

    # Find which line the position is on
    char_count = 0
    target_line = 0
    for i, line in enumerate(all_lines):
        if char_count + len(line) >= position:
            target_line = i
            break
        char_count += len(line) + 1  # +1 for \n
    else:
        target_line = len(all_lines) - 1

    start = max(0, target_line - lines)
    end = min(len(all_lines), target_line + lines + 1)

    result_lines = []
    for i in range(start, end):
        prefix = ">>>" if i == target_line else "   "
        result_lines.append(f"{prefix} {i + 1}: {all_lines[i]}")

    return "\n".join(result_lines)


def get_code_block_language(content: str, position: int) -> str | None:
    """Get the language identifier of the code block containing a position.

    Returns None if position is not inside a code block.
    """
    blocks = _find_code_blocks(content)
    for block in blocks:
        if block.start <= position <= block.end:
            return block.language or None
    return None


def is_documentation_context(content: str, position: int) -> bool:
    """Heuristic: is the match surrounded by documentation-like context?

    Checks for:
    - Match is inside a code block
    - Match is inside an HTML comment
    - Match is on a heading line
    - Surrounding lines contain list items (-, *, numbered)
    - Surrounding lines are short (typical of docs, not instructions)
    """
    if is_inside_code_block(content, position):
        return True

    if is_inside_html_comment(content, position):
        return True

    if is_inside_heading(content, position):
        return True

    context = get_surrounding_context(content, position, lines=3)

    # Check for list items, blockquotes, or short lines typical of docs
    doc_indicators = sum(1 for line in context.split("\n") if re.match(r"\s*([-*+]|\d+\.|>)\s", line))

    return doc_indicators >= 2
