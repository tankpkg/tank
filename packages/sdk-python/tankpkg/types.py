from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class UserInfo:
    user_id: str
    name: str | None = None
    email: str | None = None


@dataclass
class VersionDetail:
    name: str
    version: str
    integrity: str
    audit_score: float | None = None
    audit_status: str = ""
    download_url: str = ""
    published_at: str = ""
    downloads: int = 0
    scan_verdict: str | None = None
    scan_findings: list[dict] = field(default_factory=list)
    permissions: dict | None = None
    dependencies: dict[str, str] = field(default_factory=dict)
    description: str | None = None


@dataclass
class SkillContent:
    name: str
    version: str
    content: str
    references: dict[str, str] = field(default_factory=dict)
    scripts: dict[str, str] = field(default_factory=dict)
    files: list[str] = field(default_factory=list)
