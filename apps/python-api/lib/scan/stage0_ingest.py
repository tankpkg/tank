"""Stage 0: Ingestion & Quarantine

Downloads tarball, safely extracts to temp directory, validates file types,
computes SHA-256 hashes, and enforces size limits.
"""

import hashlib
import os
import shutil
import tarfile
import tempfile
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx

from lib.scan.models import Finding, IngestResult, StageResult

# Configuration
MAX_TARBALL_SIZE = 50 * 1024 * 1024  # 50MB
MAX_EXTRACTED_SIZE = 50 * 1024 * 1024  # 50MB
MAX_COMPRESSION_RATIO = 100  # decompressed/compressed
DOWNLOAD_TIMEOUT = 30.0  # seconds

# Allowed domains for tarball downloads (Supabase storage + configured object storage)
DEFAULT_ALLOWED_DOWNLOAD_DOMAINS = [
    "supabase.co",
    "supabase.com",
    "supabase.in",
    # Local development fallback
    "localhost",
    "127.0.0.1",
]


def get_allowed_download_domains() -> list[str]:
    domains = set(DEFAULT_ALLOWED_DOWNLOAD_DOMAINS)

    for env_name in ("S3_ENDPOINT", "S3_PUBLIC_ENDPOINT", "AUTHORIZED_STORAGE_DOMAINS"):
        value = os.environ.get(env_name, "").strip()
        if not value:
            continue

        if env_name == "AUTHORIZED_STORAGE_DOMAINS":
            domains.update(domain.strip() for domain in value.split(",") if domain.strip())
            continue

        hostname = urlparse(value).hostname
        if hostname:
            domains.add(hostname)

    return sorted(domains)


def validate_download_url(url: str) -> None:
    """Validate that the download URL is from an authorized source.

    Prevents SSRF-like attacks where malicious URLs could be provided.
    """
    parsed = urlparse(url)
    allowed_domains = get_allowed_download_domains()

    # Check scheme
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Invalid URL scheme: {parsed.scheme}")

    # Extract hostname (handle port numbers)
    hostname = parsed.hostname or ""

    # Check if hostname matches allowed domains
    is_allowed = any(hostname == allowed or hostname.endswith(f".{allowed}") for allowed in allowed_domains)

    if not is_allowed:
        raise ValueError(f"URL must be from authorized storage domain. Got: {hostname}, Allowed: {allowed_domains}")


# Allowed file extensions (whitelist)
ALLOWED_EXTENSIONS: set[str] = {
    # Documentation
    ".md",
    ".txt",
    ".rst",
    # Code
    ".py",
    ".js",
    ".ts",
    ".mjs",
    ".cjs",
    ".jsx",
    ".tsx",
    ".sh",
    ".bash",
    ".zsh",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    # Config
    ".gitignore",
    ".editorconfig",
    ".prettierrc",
    ".eslintrc",
    ".env.example",
    # Data
    ".csv",
}

# Blocked file extensions (binary/executable)
BLOCKED_EXTENSIONS: set[str] = {
    ".exe",
    ".so",
    ".dll",
    ".dylib",
    ".wasm",
    ".class",
    ".pyc",
    ".pyo",
    ".jar",
    ".war",
    ".bin",
    ".dat",
}


async def download_tarball(url: str) -> bytes:
    """Download tarball from URL with size and timeout limits.

    Validates the URL origin before downloading to prevent SSRF attacks.
    """
    # Validate URL origin before downloading
    validate_download_url(url)

    async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT) as client:
        # First, get headers to check content-length
        # URL is validated against ALLOWED_DOWNLOAD_DOMAINS in validate_download_url() above
        # nosemgrep: python.http.security.audit.http-requests
        # codeql[py/full-ssrf]
        head_response = await client.head(url, follow_redirects=True)
        content_length = int(head_response.headers.get("content-length", 0))

        if content_length > MAX_TARBALL_SIZE:
            raise ValueError(f"Tarball size {content_length} exceeds maximum {MAX_TARBALL_SIZE}")

        # Stream download to handle large files
        # URL is validated against ALLOWED_DOWNLOAD_DOMAINS in validate_download_url() above
        # nosemgrep: python.http.security.audit.http-requests
        # codeql[py/full-ssrf]
        response = await client.get(url, follow_redirects=True)
        response.raise_for_status()

        data = response.content
        if len(data) > MAX_TARBALL_SIZE:
            raise ValueError(f"Downloaded size {len(data)} exceeds maximum {MAX_TARBALL_SIZE}")

        return data


def validate_tarball_safety(tar_path: str, compressed_size: int) -> list[Finding]:
    """Check for zip bombs and dangerous archive contents."""
    findings: list[Finding] = []

    try:
        with tarfile.open(tar_path, "r:gz") as tar:
            members = tar.getmembers()

            total_uncompressed = 0
            for member in members:
                # Check for symlinks and hardlinks
                if member.issym() or member.islnk():
                    findings.append(
                        Finding(
                            stage="stage0",
                            severity="high",
                            type="archive_link",
                            description=f"Archive contains {'symlink' if member.issym() else 'hardlink'}: {member.name}",
                            location=member.name,
                            confidence=1.0,
                            tool="stage0_ingest",
                        )
                    )
                    continue

                # Check for path traversal
                if ".." in member.name or member.name.startswith("/"):
                    findings.append(
                        Finding(
                            stage="stage0",
                            severity="critical",
                            type="path_traversal",
                            description=f"Archive contains dangerous path: {member.name}",
                            location=member.name,
                            confidence=1.0,
                            tool="stage0_ingest",
                        )
                    )
                    continue

                # Track uncompressed size
                if member.isfile():
                    total_uncompressed += member.size

            # Check compression ratio (zip bomb detection)
            if compressed_size > 0:
                ratio = total_uncompressed / compressed_size
                if ratio > MAX_COMPRESSION_RATIO:
                    findings.append(
                        Finding(
                            stage="stage0",
                            severity="critical",
                            type="zip_bomb",
                            description=f"Compression ratio {ratio:.1f}x exceeds maximum {MAX_COMPRESSION_RATIO}x",
                            confidence=0.9,
                            tool="stage0_ingest",
                        )
                    )

    except Exception as e:
        findings.append(
            Finding(
                stage="stage0",
                severity="critical",
                type="archive_error",
                description=f"Failed to validate tarball: {e!s}",
                confidence=1.0,
                tool="stage0_ingest",
            )
        )

    return findings


def safe_extract(tar_path: str, dest_dir: str) -> tuple[list[Finding], list[str], int]:
    """Safely extract tarball to destination directory.

    Returns: (findings, extracted_files, total_size)
    """
    findings: list[Finding] = []
    extracted_files: list[str] = []
    total_size = 0

    with tarfile.open(tar_path, "r:gz") as tar:
        for member in tar.getmembers():
            # Skip symlinks, hardlinks, and dangerous paths
            if member.issym() or member.islnk():
                continue
            if ".." in member.name or member.name.startswith("/"):
                continue

            # Check file extension
            ext = Path(member.name).suffix.lower()

            # Check for blocked extensions
            if ext in BLOCKED_EXTENSIONS:
                findings.append(
                    Finding(
                        stage="stage0",
                        severity="critical",
                        type="blocked_file_type",
                        description=f"Blocked binary/executable file type: {ext}",
                        location=member.name,
                        confidence=1.0,
                        tool="stage0_ingest",
                    )
                )
                continue

            # Extract file
            if member.isfile():
                # Validate extraction path stays within dest_dir
                dest_path = Path(dest_dir) / member.name
                try:
                    dest_path.resolve().relative_to(Path(dest_dir).resolve())
                except ValueError:
                    findings.append(
                        Finding(
                            stage="stage0",
                            severity="critical",
                            type="path_escape",
                            description=f"Extraction path escapes destination: {member.name}",
                            location=member.name,
                            confidence=1.0,
                            tool="stage0_ingest",
                        )
                    )
                    continue

                # Extract
                tar.extract(member, dest_dir, set_attrs=False)
                extracted_files.append(member.name)
                total_size += member.size

                # Check individual file size
                if member.size > 5 * 1024 * 1024:  # 5MB
                    findings.append(
                        Finding(
                            stage="stage0",
                            severity="medium",
                            type="large_file",
                            description=f"File exceeds 5MB: {member.name} ({member.size} bytes)",
                            location=member.name,
                            confidence=1.0,
                            tool="stage0_ingest",
                        )
                    )

    return findings, extracted_files, total_size


def compute_file_hashes(base_dir: str, files: list[str]) -> dict[str, str]:
    """Compute SHA-256 hash for each file."""
    hashes: dict[str, str] = {}

    for file_path in files:
        full_path = Path(base_dir) / file_path
        if full_path.is_file():
            try:
                sha256 = hashlib.sha256()
                with open(full_path, "rb") as f:
                    for chunk in iter(lambda: f.read(8192), b""):
                        sha256.update(chunk)
                hashes[file_path] = sha256.hexdigest()
            except Exception:
                pass  # Skip files we can't read

    return hashes


def _ignore_symlinks(directory: str, entries: list[str]) -> set[str]:
    """copytree ignore function that skips symlinks at every level."""
    return {e for e in entries if os.path.islink(os.path.join(directory, e))}


def narrow_to_sub_path(
    temp_dir: str,
    sub_path: str,
    extracted_files: list[str],
) -> tuple[str, list[str], int | None, list[Finding]]:
    """Narrow extracted contents to a specific subdirectory.

    Used for monorepo support where a tarball contains multiple skills
    but only one should be scanned.

    GitHub tarballs extract with a prefix directory (e.g., "owner-repo-sha/"),
    so we look for sub_path inside that prefix.

    Args:
        temp_dir: Path to the full extraction directory
        sub_path: Subdirectory to narrow to (e.g., "my-skill")
        extracted_files: List of relative file paths from extraction

    Returns:
        (new_temp_dir, filtered_files, total_size_or_none, findings)
        total_size is None on early-return paths to avoid overwriting caller's value.
    """
    findings: list[Finding] = []

    # Reject empty/whitespace-only sub_path
    sub_path = sub_path.strip()
    if not sub_path:
        return temp_dir, extracted_files, None, findings

    # Reject null bytes — Path() accepts them but filesystem calls crash
    if "\x00" in sub_path:
        findings.append(
            Finding(
                stage="stage0",
                severity="critical",
                type="invalid_sub_path",
                description="Invalid sub_path contains null byte",
                confidence=1.0,
                tool="stage0_ingest",
            )
        )
        return temp_dir, extracted_files, None, findings

    # Sanitize sub_path to prevent path traversal
    clean_sub_path = Path(sub_path).as_posix()

    # Per-component check: reject ".." and "." as path components.
    # Substring check (".." in s) would false-positive on names like "skill-v2..0".
    parts = Path(clean_sub_path).parts
    if not parts or any(part in ("..", ".") for part in parts) or clean_sub_path.startswith("/"):
        findings.append(
            Finding(
                stage="stage0",
                severity="critical",
                type="invalid_sub_path",
                description=f"Invalid sub_path contains path traversal: {sub_path[:255]}",
                confidence=1.0,
                tool="stage0_ingest",
            )
        )
        return temp_dir, extracted_files, None, findings

    # GitHub tarballs have a single top-level directory (e.g., "owner-repo-sha/")
    top_entries = [e for e in os.listdir(temp_dir) if os.path.isdir(os.path.join(temp_dir, e))]

    if len(top_entries) == 1:
        repo_root = os.path.join(temp_dir, top_entries[0])
    else:
        repo_root = temp_dir

    target_dir = os.path.join(repo_root, clean_sub_path)

    # Verify target stays within temp_dir (defense in depth)
    try:
        Path(target_dir).resolve().relative_to(Path(temp_dir).resolve())
    except ValueError:
        findings.append(
            Finding(
                stage="stage0",
                severity="critical",
                type="sub_path_escape",
                description=f"sub_path resolves outside extraction directory: {sub_path[:255]}",
                confidence=1.0,
                tool="stage0_ingest",
            )
        )
        return temp_dir, extracted_files, None, findings

    if not os.path.isdir(target_dir):
        findings.append(
            Finding(
                stage="stage0",
                severity="medium",
                type="sub_path_not_found",
                description=f"Requested sub_path '{sub_path[:255]}' not found in archive",
                confidence=1.0,
                tool="stage0_ingest",
            )
        )
        return temp_dir, extracted_files, None, findings

    # Create new temp directory with only the sub_path contents.
    # Skip symlinks entirely (matches safe_extract behavior) — copytree/copy2
    # would either follow them out of sandbox or preserve dangling links.
    new_temp_dir = tempfile.mkdtemp(prefix="tank_scan_sub_")
    try:
        for item in os.listdir(target_dir):
            src = os.path.join(target_dir, item)
            if os.path.islink(src):
                continue
            dst = os.path.join(new_temp_dir, item)
            if os.path.isdir(src):
                shutil.copytree(src, dst, ignore=_ignore_symlinks)
            else:
                shutil.copy2(src, dst, follow_symlinks=False)
    except Exception:
        shutil.rmtree(new_temp_dir, ignore_errors=True)
        raise

    # Clean up original temp dir
    shutil.rmtree(temp_dir, ignore_errors=True)

    # Build new file list and compute total size
    new_files: list[str] = []
    total_size = 0
    for root, _dirs, files in os.walk(new_temp_dir):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, new_temp_dir)
            new_files.append(rel)
            total_size += os.path.getsize(full)

    return new_temp_dir, new_files, total_size, findings


async def stage0_ingest(tarball_url: str, sub_path: str | None = None) -> IngestResult:
    """Run Stage 0: Ingestion & Quarantine.

    Downloads tarball, safely extracts to temp directory, validates contents,
    and computes file hashes. Optionally narrows to a subdirectory for
    monorepo support.

    Args:
        tarball_url: Signed URL to download the skill tarball
        sub_path: Optional subdirectory to narrow the scan to

    Returns:
        IngestResult with temp directory path, file hashes, and any findings
    """
    start = time.monotonic()
    findings: list[Finding] = []

    # Download tarball
    try:
        tarball_data = await download_tarball(tarball_url)
    except Exception as e:
        findings.append(
            Finding(
                stage="stage0",
                severity="critical",
                type="download_failed",
                description=f"Failed to download tarball: {e!s}",
                confidence=1.0,
                tool="stage0_ingest",
            )
        )
        return IngestResult(
            temp_dir="",
            file_hashes={},
            file_list=[],
            total_size=0,
            stage_result=StageResult(
                stage="stage0",
                status="failed",
                findings=findings,
                duration_ms=int((time.monotonic() - start) * 1000),
                error=str(e),
            ),
        )

    compressed_size = len(tarball_data)

    # Create temp directory
    temp_dir = tempfile.mkdtemp(prefix="tank_scan_")

    # Write tarball to temp file for validation
    tar_path = os.path.join(temp_dir, "package.tgz")
    with open(tar_path, "wb") as f:
        f.write(tarball_data)

    # Validate tarball safety (zip bomb, dangerous paths)
    safety_findings = validate_tarball_safety(tar_path, compressed_size)
    findings.extend(safety_findings)

    # Check for critical findings that should stop extraction
    critical_findings = [f for f in safety_findings if f.severity == "critical"]
    if critical_findings:
        # Clean up tarball file, but return temp_dir so orchestrator can clean it up.
        # The orchestrator's finally block calls cleanup_ingest() to remove the directory.
        os.remove(tar_path)
        return IngestResult(
            temp_dir=temp_dir,
            file_hashes={},
            file_list=[],
            total_size=0,
            stage_result=StageResult(
                stage="stage0",
                status="failed",
                findings=findings,
                duration_ms=int((time.monotonic() - start) * 1000),
            ),
        )

    # Safe extract
    extract_findings, extracted_files, total_size = safe_extract(tar_path, temp_dir)
    findings.extend(extract_findings)

    # Check total extracted size
    if total_size > MAX_EXTRACTED_SIZE:
        findings.append(
            Finding(
                stage="stage0",
                severity="critical",
                type="size_exceeded",
                description=f"Total extracted size {total_size} exceeds maximum {MAX_EXTRACTED_SIZE}",
                confidence=1.0,
                tool="stage0_ingest",
            )
        )

    # Remove the tarball (we don't need it anymore)
    os.remove(tar_path)

    # Narrow to sub_path if specified (monorepo support)
    if sub_path:
        temp_dir, extracted_files, narrowed_size, sub_path_findings = narrow_to_sub_path(
            temp_dir, sub_path, extracted_files
        )
        if narrowed_size is not None:
            total_size = narrowed_size
        findings.extend(sub_path_findings)

    # Compute file hashes
    file_hashes = compute_file_hashes(temp_dir, extracted_files)

    # Determine status
    has_critical = any(f.severity == "critical" for f in findings)
    status = "failed" if has_critical else "passed"

    return IngestResult(
        temp_dir=temp_dir,
        file_hashes=file_hashes,
        file_list=extracted_files,
        total_size=total_size,
        stage_result=StageResult(
            stage="stage0",
            status=status,
            findings=findings,
            duration_ms=int((time.monotonic() - start) * 1000),
        ),
    )


def cleanup_ingest(temp_dir: str) -> None:
    """Clean up the temporary directory created during ingestion."""
    if temp_dir and os.path.exists(temp_dir):
        shutil.rmtree(temp_dir, ignore_errors=True)
