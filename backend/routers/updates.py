"""Update check router — queries GitHub Releases API for latest version."""

import json
import re
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
DOCKER_SOCKET_PATH = "/var/run/docker.sock"

# ── Docker Socket HTTP client ──────────────────────────────────────


def _docker_signal(container: str, signal: str) -> dict:
    """Send a signal to a Docker container via the Docker Engine API over Unix socket.

    Uses httpx with a Unix socket transport so no Docker CLI is needed —
    the Docker socket must be mounted at /var/run/docker.sock.

    Returns {"ok": True} on success, or {"ok": False, "error": <message>} on failure.
    """
    transport = httpx.HTTPTransport(uds=DOCKER_SOCKET_PATH)
    try:
        with httpx.Client(transport=transport, timeout=10.0) as client:
            resp = client.post(
                f"http://localhost/containers/{container}/kill?signal={signal}",
            )
        if resp.status_code == 204:
            return {"ok": True}
        if resp.status_code == 404:
            return {"ok": False, "error": f"未检测到 {container} 容器，请确认容器正在运行"}
        body = resp.text.strip() or f"Docker API returned {resp.status_code}"
        return {"ok": False, "error": body}
    except httpx.ConnectError:
        return {"ok": False, "error": "无法连接 Docker 套接字，请确认 /var/run/docker.sock 已挂载"}
    except httpx.TimeoutException:
        return {"ok": False, "error": "向 Docker 发送信号超时"}


@router.post("/trigger")
def trigger_update(current_user: dict = Depends(get_current_user)):
    """Manually trigger watchtower to check for updates immediately.

    Sends SIGHUP to the watchtower container via the Docker Engine API
    (Unix socket).  This causes watchtower to run its update cycle
    right away instead of waiting for the normal polling interval.

    Requires:
      - Docker socket mounted to the xplora container at /var/run/docker.sock
      - watchtower container running with the appropriate label

    Returns 503 if docker/watchtower is unavailable.
    """
    result = _docker_signal(WATCHTOWER_CONTAINER, "HUP")
    if result["ok"]:
        return {
            "status": "triggered",
            "message": f"已向 {WATCHTOWER_CONTAINER} 发送更新信号，将在数秒内检测并拉取新镜像",
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
        latest_tag = data.get("tag_name", "").lstrip("v")
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
