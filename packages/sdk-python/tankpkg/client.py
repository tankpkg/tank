from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from urllib.parse import quote

import httpx

from tankpkg.errors import (
    TankAuthError,
    TankIntegrityError,
    TankNetworkError,
    TankNotFoundError,
    TankPermissionError,
)
from tankpkg.types import SkillContent, UserInfo, VersionDetail

SDK_VERSION = "0.10.6"
DEFAULT_REGISTRY_URL = "https://www.tankpkg.dev"
DEFAULT_CONFIG_DIR = "~/.tank"
DEFAULT_MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30.0


def _read_config(config_dir: str | None = None) -> dict:
    config_path = Path(config_dir or DEFAULT_CONFIG_DIR).expanduser() / "config.json"
    try:
        return json.loads(config_path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _resolve_token(token: str | None, config: dict) -> str | None:
    if token:
        return token
    env_token = os.environ.get("TANK_TOKEN", "").strip()
    if env_token:
        return env_token
    return config.get("token")


def _resolve_registry(registry_url: str | None, config: dict) -> str:
    if registry_url:
        return registry_url.rstrip("/")
    env_url = os.environ.get("TANK_REGISTRY_URL", "").strip()
    if env_url:
        return env_url.rstrip("/")
    return (config.get("registry") or DEFAULT_REGISTRY_URL).rstrip("/")


def _encode_name(name: str) -> str:
    return quote(name, safe="")


class TankClient:
    def __init__(
        self,
        *,
        token: str | None = None,
        registry_url: str | None = None,
        config_dir: str | None = None,
        max_retries: int = DEFAULT_MAX_RETRIES,
        timeout: float = DEFAULT_TIMEOUT,
    ):
        config = _read_config(config_dir)
        self._token = _resolve_token(token, config)
        self._registry = _resolve_registry(registry_url, config)
        self._max_retries = max_retries
        self._timeout = timeout
        self._client = httpx.Client(timeout=timeout)

    def _headers(self) -> dict[str, str]:
        h: dict[str, str] = {"User-Agent": f"tankpkg-sdk-python/{SDK_VERSION}"}
        if self._token:
            h["Authorization"] = f"Bearer {self._token}"
        return h

    def _request(self, method: str, path: str, *, json_body: dict | None = None) -> httpx.Response:
        url = f"{self._registry}/api/v1{path}"
        last_err: Exception | None = None

        for attempt in range(self._max_retries + 1):
            try:
                resp = self._client.request(
                    method, url, headers=self._headers(), json=json_body, follow_redirects=False
                )
                if 300 <= resp.status_code < 400:
                    raise TankNetworkError(f"Unexpected redirect ({resp.status_code}) from {url}")
                if resp.status_code in (429, 500, 502, 503) and attempt < self._max_retries:
                    time.sleep(min(2**attempt, 30))
                    continue
                return resp
            except httpx.HTTPError as exc:
                last_err = exc
                if attempt < self._max_retries:
                    time.sleep(min(2**attempt, 30))
                    continue

        raise TankNetworkError(f"Request to {url} failed after {self._max_retries + 1} attempts", cause=last_err)

    def _json(self, method: str, path: str, *, json_body: dict | None = None) -> dict:
        resp = self._request(method, path, json_body=json_body)
        if resp.status_code == 401:
            raise TankAuthError()
        if resp.status_code == 403:
            raise TankPermissionError(resp.json().get("error", "Permission denied"))
        if resp.status_code == 404:
            raise TankNotFoundError(resp.json().get("error", "Not found"))
        if not resp.is_success:
            raise TankNetworkError(f"HTTP {resp.status_code}: {resp.text}")
        return resp.json()

    def search(self, query: str, *, page: int = 1, limit: int = 20) -> dict:
        return self._json("GET", f"/search?q={quote(query)}&page={page}&limit={limit}")

    def info(self, name: str) -> dict:
        return self._json("GET", f"/skills/{_encode_name(name)}")

    def versions(self, name: str) -> dict:
        return self._json("GET", f"/skills/{_encode_name(name)}/versions")

    def version_detail(self, name: str, version: str) -> VersionDetail:
        data = self._json("GET", f"/skills/{_encode_name(name)}/{version}")
        return VersionDetail(
            name=data.get("name", name),
            version=data.get("version", version),
            integrity=data.get("integrity", ""),
            audit_score=data.get("auditScore"),
            audit_status=data.get("auditStatus", ""),
            download_url=data.get("downloadUrl", ""),
            published_at=data.get("publishedAt", ""),
            downloads=data.get("downloads", 0),
            scan_verdict=data.get("scanVerdict"),
            scan_findings=data.get("scanFindings", []),
            permissions=data.get("permissions"),
            dependencies=data.get("dependencies", {}),
            description=data.get("description"),
        )

    def download(self, name: str, version: str, *, dest: str | None = None) -> bytes:
        detail = self.version_detail(name, version)
        resp = self._client.get(detail.download_url, follow_redirects=False)
        if 300 <= resp.status_code < 400:
            raise TankNetworkError(f"Unexpected redirect ({resp.status_code}) from download URL")
        if not resp.is_success:
            raise TankNetworkError(f"Failed to download tarball: HTTP {resp.status_code}")

        data = resp.content
        if dest:
            dest_path = Path(dest).expanduser()
            dest_path.mkdir(parents=True, exist_ok=True)
            safe_name = name.replace("/", "-").replace("..", "")
            file_path = dest_path / f"{safe_name}-{version}.tgz"
            file_path.write_bytes(data)

            computed = "sha512-" + hashlib.sha512(data).digest().hex()
            if detail.integrity and detail.integrity != "pending" and computed != detail.integrity:
                file_path.unlink(missing_ok=True)
                raise TankIntegrityError("Integrity verification failed", expected=detail.integrity, actual=computed)

        return data

    def audit(self, name: str, version: str | None = None) -> VersionDetail:
        if version:
            return self.version_detail(name, version)
        skill_info = self.info(name)
        latest = skill_info.get("latestVersion")
        if not latest:
            raise TankNotFoundError(f"No versions found for {name}", skill_name=name)
        return self.version_detail(name, latest)

    def permissions(self, name: str, version: str | None = None) -> dict | None:
        detail = self.audit(name, version)
        return detail.permissions

    def list_files(self, name: str, version: str | None = None) -> list[str]:
        if not version:
            skill_info = self.info(name)
            version = skill_info.get("latestVersion")
            if not version:
                raise TankNotFoundError(f"No versions found for {name}", skill_name=name)
        data = self._json("GET", f"/skills/{_encode_name(name)}/{version}/files")
        return data.get("files", [])

    def read_file(self, name: str, version: str, file_path: str) -> str:
        normalized = file_path.replace("\\", "/").replace("\x00", "")
        if not normalized or normalized.startswith("/") or ".." in normalized.split("/"):
            raise TankNetworkError(f"Invalid file path: {file_path}")
        encoded_name = _encode_name(name)
        encoded_path = "/".join(quote(seg, safe="") for seg in normalized.split("/"))
        resp = self._request("GET", f"/skills/{encoded_name}/{version}/files/{encoded_path}")
        if resp.status_code == 404:
            raise TankNotFoundError(f"File not found: {file_path}", skill_name=name)
        if not resp.is_success:
            raise TankNetworkError(f"Failed to read file: HTTP {resp.status_code}")
        return resp.text

    def read_skill(self, name: str, version: str | None = None) -> SkillContent:
        if not version:
            skill_info = self.info(name)
            version = skill_info.get("latestVersion")
            if not version:
                raise TankNotFoundError(f"No versions found for {name}", skill_name=name)

        files = self.list_files(name, version)
        content = self.read_file(name, version, "SKILL.md") if "SKILL.md" in files else ""

        references: dict[str, str] = {}
        for f in files:
            if f.startswith("references/"):
                key = f.removeprefix("references/")
                references[key] = self.read_file(name, version, f)

        scripts: dict[str, str] = {}
        for f in files:
            if f.startswith("scripts/"):
                key = f.removeprefix("scripts/")
                scripts[key] = self.read_file(name, version, f)

        return SkillContent(
            name=name,
            version=version,
            content=content,
            references=references,
            scripts=scripts,
            files=files,
        )

    def whoami(self) -> UserInfo | None:
        if not self._token:
            return None
        try:
            data = self._json("GET", "/auth/whoami")
            return UserInfo(user_id=data["userId"], name=data.get("name"), email=data.get("email"))
        except TankAuthError:
            return None

    def get_star_count(self, name: str) -> dict:
        return self._json("GET", f"/skills/{_encode_name(name)}/star")
