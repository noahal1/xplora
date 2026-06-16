"""Update check router — queries GitHub Releases API for latest version."""

import json
import re
import subprocess
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


@router.post("/trigger")
def trigger_update(current_user: dict = Depends(get_current_user)):
    """Manually trigger watchtower to check for updates immediately.

    Sends SIGHUP to the watchtower container, which causes it to
    run its update cycle right away instead of waiting for the
    normal polling interval.

    Requires:
      - Docker socket mounted to the xplora container
      - docker CLI installed in the container
      - watchtower container running and labeled

    Returns 503 if docker/watchtower is unavailable.
    """
    try:
        result = subprocess.run(
            ["docker", "kill", "-s", "HUP", WATCHTOWER_CONTAINER],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            return {
                "status": "triggered",
                "message": f"已向 {WATCHTOWER_CONTAINER} 发送更新信号，将在数秒内检测并拉取新镜像",
            }
        error_msg = result.stderr.strip() or f"docker kill returned {result.returncode}"
        raise RuntimeError(error_msg)
    except FileNotFoundError:
        raise HTTPException(
            status_code=503,
            detail="Docker CLI 未安装，无法触发手动更新",
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=504,
            detail="向 Docker 发送信号超时",
        )
    except RuntimeError as e:
        if "No such container" in str(e):
            raise HTTPException(
                status_code=503,
                detail=f"未检测到 {WATCHTOWER_CONTAINER} 容器，请确认 watchtower 正在运行",
            )
        raise HTTPException(
            status_code=503,
            detail=f"触发更新失败: {e}",
        )


@router.get("/check")


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
