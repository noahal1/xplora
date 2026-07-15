"""Update check router — queries GitHub Releases API for latest version."""

import json
import re
import subprocess  # noqa: S404
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from __version__ import VERSION
from auth import get_current_user

router = APIRouter(prefix="/api/update", tags=["update"])

# ── Cache ──────────────────────────────────────────────────────────
# GitHub API has rate limits (60 req/hr unauthenticated), so cache
# aggressively.  Cache is invalidated after CACHE_TTL seconds.

_CACHE: dict | None = None
_CACHE_TIME: float = 0.0
_CACHE_TTL = 7200  
GITHUB_API_URL = "https://api.github.com/repos/noahal1/xplora/releases/latest"
WATCHTOWER_CONTAINER = "watchtower"


def _restart_container(container: str) -> dict:
    """Restart a Docker container via the docker CLI (socket must be mounted).

    Uses subprocess to call `docker restart` instead of the Docker Engine
    API directly, because sending SIGHUP via the API kill endpoint can
    cause the target process (watchtower) to exit as PID 1.

    Returns {"ok": True} on success, or {"ok": False, "error": <message>}.
    """
    try:
        result = subprocess.run(
            ["docker", "restart", container],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            return {"ok": True, "message": result.stdout.strip()}
        # Common error: container not found
        stderr = result.stderr.strip()
        if "No such container" in stderr:
            return {"ok": False, "error": f"未检测到 {container} 容器，请确认容器正在运行"}
        if "Cannot connect to the Docker daemon" in stderr:
            return {"ok": False, "error": "无法连接 Docker 套接字，请确认 /var/run/docker.sock 已挂载"}
        return {"ok": False, "error": stderr or f"docker restart 返回码 {result.returncode}"}
    except FileNotFoundError:
        return {"ok": False, "error": "容器中未安装 docker CLI，无法执行重启"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "重启容器超时"}


@router.post("/trigger")
def trigger_update(current_user: dict = Depends(get_current_user)):
    """Manually trigger watchtower to check for updates immediately.

    Restarts the watchtower container via `docker restart`, which causes
    it to run its update cycle immediately (watchtower always runs a check
    on startup).

    Requires:
      - Docker socket mounted to the xplora container at /var/run/docker.sock
      - watchtower container running with the appropriate label

    Returns 503 if docker/watchtower is unavailable.
    """
    result = _restart_container(WATCHTOWER_CONTAINER)
    if result["ok"]:
        return {
            "status": "triggered",
            "message": f"已重启 {WATCHTOWER_CONTAINER}，启动后将立即检测并拉取新镜像",
        }
    raise HTTPException(
        status_code=503,
        detail=result["error"],
    )



def _semver_tuple(v: str) -> tuple:
    """Parse a semver string like '2.0.0' or 'dawn-1.2.0' into a comparable tuple."""
    # Extract numeric semver (e.g. "1.2.0" from "dawn-1.2.0" or "v2.0.0")
    match = re.search(r"(\d+\.\d+\.\d+)", v)
    if not match:
        return (0, 0, 0)
    parts = match.group(1).split(".")
    return tuple(int(p) for p in parts)


def _get_update_info() -> dict:
    """Fetch latest release info from GitHub API, with caching."""
    global _CACHE, _CACHE_TIME

    now = time.time()
    if _CACHE is not None and (now - _CACHE_TIME) < _CACHE_TTL:
        return _CACHE

    default_result = {
        "current_version": VERSION,
        "latest_version": None,
        "update_available": False,
        "release_url": None,
        "release_notes": None,
        "published_at": None,
        "error": None,
    }

    try:
        resp = httpx.get(
            GITHUB_API_URL,
            headers={"Accept": "application/vnd.github.v3+json"},
            timeout=10.0,
        )
        if resp.status_code != 200:
            default_result["error"] = f"GitHub API returned {resp.status_code}"
            _CACHE = default_result
            _CACHE_TIME = now
            return default_result

        data = resp.json()
        # Strip leading "v" only when followed by a digit (e.g. "v2.0.0" → "2.0.0")
        # but preserve version names like "voyage-2.0.0"
        raw_tag = data.get("tag_name", "")
        if raw_tag.startswith("v") and len(raw_tag) > 1 and raw_tag[1].isdigit():
            latest_tag = raw_tag[1:]
        else:
            latest_tag = raw_tag
        release_url = data.get("html_url")
        published_at = data.get("published_at")
        body = data.get("body", "")

        # Trim release notes to a reasonable length
        if body and len(body) > 2000:
            body = body[:2000] + "\n\n*...（内容已截断）*"

        latest_version = latest_tag or None
        update_available = False
        if latest_version:
            update_available = _semver_tuple(latest_version) > _semver_tuple(VERSION)

        result = {
            "current_version": VERSION,
            "latest_version": latest_version,
            "update_available": update_available,
            "release_url": release_url,
            "release_notes": body,
            "published_at": published_at,
            "error": None,
        }
        _CACHE = result
        _CACHE_TIME = now
        return result

    except httpx.TimeoutException:
        default_result["error"] = "请求 GitHub API 超时"
        _CACHE = default_result
        _CACHE_TIME = now
        return default_result
    except Exception as e:
        default_result["error"] = str(e)
        _CACHE = default_result
        _CACHE_TIME = now
        return default_result


@router.get("/check")
def check_update(force: bool = False):
    """Check if a newer version is available via GitHub Releases.

    Results are cached for 1 hour. Pass `?force=true` to bypass cache.
    """
    global _CACHE, _CACHE_TIME

    if force:
        _CACHE = None
        _CACHE_TIME = 0.0

    return _get_update_info()
