from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import quote, urlparse

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
MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024


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


def _parse_registry_origin(raw: str) -> str:
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Registry URL must use http or https: {raw}")
    if parsed.username or parsed.password:
        raise ValueError(f"Registry URL must not contain credentials: {raw}")
    port = f":{parsed.port}" if parsed.port else ""
    return f"{parsed.scheme}://{parsed.hostname}{port}"


def _resolve_registry(registry_url: str | None, config: dict) -> str:
    raw = (
        registry_url
        or os.environ.get("TANK_REGISTRY_URL", "").strip()
        or config.get("registry")
        or DEFAULT_REGISTRY_URL
    )
    return _parse_registry_origin(raw)


def _validate_download_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise TankNetworkError(f"Download URL must use http or https: {url}")
    if parsed.username or parsed.password:
        raise TankNetworkError(f"Download URL must not contain credentials: {url}")


def _encode_name(name: str) -> str:
    return quote(name, safe="")


def _safe_json(resp: httpx.Response, fallback_key: str, fallback_msg: str) -> str:
    try:
        return resp.json().get(fallback_key, fallback_msg)
    except Exception:
        return resp.text or fallback_msg


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

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> TankClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

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
                    method,
                    url,
                    headers=self._headers(),
                    json=json_body,
                    follow_redirects=False,
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
            raise TankPermissionError(_safe_json(resp, "error", "Permission denied"))
        if resp.status_code == 404:
            raise TankNotFoundError(_safe_json(resp, "error", "Not found"))
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
        _validate_download_url(detail.download_url)

        received = 0
        chunks: list[bytes] = []
        with self._client.stream("GET", detail.download_url, follow_redirects=False) as resp:
            if 300 <= resp.status_code < 400:
                raise TankNetworkError(f"Unexpected redirect ({resp.status_code}) from download URL")
            if not resp.is_success:
                raise TankNetworkError(f"Failed to download tarball: HTTP {resp.status_code}")
            for chunk in resp.iter_bytes():
                received += len(chunk)
                if received > MAX_DOWNLOAD_BYTES:
                    raise TankNetworkError(f"Tarball exceeds {MAX_DOWNLOAD_BYTES} byte limit")
                chunks.append(chunk)

        data = b"".join(chunks)

        if dest:
            dest_path = Path(dest).expanduser().resolve()
            dest_path.mkdir(parents=True, exist_ok=True)
            safe_name = re.sub(r"[/\\]", "-", name).replace("..", "")
            safe_version = re.sub(r"[/\\]", "-", version).replace("..", "")
            file_path = dest_path / f"{safe_name}-{safe_version}.tgz"
            if not file_path.resolve().is_relative_to(dest_path):
                raise TankNetworkError("Path traversal detected in filename")
            file_path.write_bytes(data)

            computed = "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()
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
        return self.audit(name, version).permissions

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
                references[f.removeprefix("references/")] = self.read_file(name, version, f)

        scripts: dict[str, str] = {}
        for f in files:
            if f.startswith("scripts/"):
                scripts[f.removeprefix("scripts/")] = self.read_file(name, version, f)

        return SkillContent(
            name=name, version=version, content=content, references=references, scripts=scripts, files=files
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
