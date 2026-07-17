"""Connector for MoviePilot PT download REST API.

MoviePilot is a self-hosted PT (Private Tracker) download management
service. Xplora communicates with it via its REST API to search torrents,
trigger downloads, and query download status.

MoviePilot API Reference (v2):
    GET  /api/v1/search/title?keyword=xxx&token=xxx  → search torrents
    POST /api/v1/download/add?token=xxx               → add download task
    GET  /api/v1/download/?token=xxx                  → query download queue

Auth: MoviePilot v2 authenticates via ``?token=...`` query parameter only.
      ``Authorization: Bearer`` is **not** supported.
      See https://mattoid.top/docs/moviepilot/configuration
"""

import asyncio
import logging
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)


# ── Retry helper ───────────────────────────────────────────────────
# MoviePilot connections can be intermittently flaky (TCP handshake
# timeouts, DNS glitches), so we retry transient RequestError failures.

_MAX_RETRIES = 2
_RETRY_DELAY = 1.0  # seconds between retries


async def _retry_on_request_error(fn):
    """Call ``fn()`` and retry on ``httpx.RequestError`` up to ``_MAX_RETRIES`` times."""
    last_exc = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            return await fn()
        except httpx.RequestError as e:
            last_exc = e
            if attempt < _MAX_RETRIES:
                logger.debug("MP request attempt %s failed, retrying in %ss: %s", attempt + 1, _RETRY_DELAY, e)
                await asyncio.sleep(_RETRY_DELAY)
    raise last_exc  # type: ignore[misc]



# ── Helpers ────────────────────────────────────────────────────────


def _parse_mp_speed(speed_str: str) -> int:
    """Parse a MoviePilot speed string (e.g. '8.47M', '0.0B') to bytes/s."""
    if not speed_str or not speed_str.strip():
        return 0
    speed_str = speed_str.strip().upper()
    match = re.match(r"^([\d.]+)\s*([BKMG]?)B?$", speed_str)
    if not match:
        return 0
    num = float(match.group(1))
    unit = match.group(2)
    multipliers = {"": 1, "B": 1, "K": 1024, "M": 1024**2, "G": 1024**3}
    return int(num * multipliers.get(unit, 1))

# ── Shared HTTP client with connection pooling ─────────────────────
# Reuse a single AsyncClient across all requests to keep TCP
# connections alive (HTTP keep-alive).  The client is created lazily
# and can be closed via close_mp_client() on app shutdown.

_shared_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None:
        _shared_client = httpx.AsyncClient(timeout=15.0)
    return _shared_client


async def close_mp_client():
    """Close the shared HTTP client (call on app shutdown)."""
    global _shared_client
    if _shared_client is not None:
        await _shared_client.aclose()
        _shared_client = None


class MoviePilotConnector:
    """Connector to MoviePilot REST API.

    Wraps all HTTP calls to a MoviePilot instance with async/await
    and consistent error handling. Uses a shared httpx.AsyncClient
    with connection pooling for better performance.
    """

    def __init__(self, host: str, port: int, api_token: str, use_ssl: bool = False):
        self.host = host
        self.port = port
        self.api_token = api_token
        self.use_ssl = use_ssl

    # ── Properties ────────────────────────────────────────────────

    @property
    def base_url(self) -> str:
        scheme = "https" if self.use_ssl else "http"
        return f"{scheme}://{self.host}:{self.port}"

    def _build_url(self, path: str) -> str:
        """Build a base URL for the given path (no query params)."""
        return f"{self.base_url}{path}"

    # ── HTTP helpers ──────────────────────────────────────────────

    async def _get(self, path: str, params: dict | None = None) -> dict | list | None:
        """Send an authenticated GET request with automatic retry on transient errors."""
        url = self._build_url(path)
        merged_params: dict[str, str] = {"token": self.api_token}
        if params:
            merged_params.update(params)

        async def _do_get():
            client = _get_client()
            resp = await client.get(url, params=merged_params)
            resp.raise_for_status()
            return resp.json()

        try:
            return await _retry_on_request_error(_do_get)
        except httpx.HTTPStatusError as e:
            logger.warning("MP HTTP error %s: %s — %s", e.response.status_code, url, e.response.text[:200])
            return None
        except httpx.RequestError as e:
            logger.warning("MP request failed after %s retries: %s — %s", _MAX_RETRIES, url, e)
            return None

    async def _post(self, path: str, json_data: dict | None = None) -> dict | None:
        """Send an authenticated POST request with automatic retry on transient errors."""
        url = self._build_url(path)
        params = {"token": self.api_token}

        async def _do_post():
            client = _get_client()
            resp = await client.post(url, params=params, json=json_data)
            resp.raise_for_status()
            return resp.json()

        try:
            return await _retry_on_request_error(_do_post)
        except httpx.HTTPStatusError as e:
            logger.warning("MP POST error %s: %s — %s", e.response.status_code, url, e.response.text[:200])
            return None
        except httpx.RequestError as e:
            logger.warning("MP POST failed after %s retries: %s — %s", _MAX_RETRIES, url, e)
            return None

    # ── Public API ────────────────────────────────────────────────

    async def test_connection(self) -> dict:
        """Test the connection to MoviePilot by fetching the download queue.

        Uses GET /api/v1/download/ as a health check — it requires
        authentication and returns a list (possibly empty).
        """
        data = await self._get("/api/v1/download/")
        if data is None:
            return {"online": False, "message": "无法连接 MoviePilot，请检查地址、端口和 API Token"}

        if isinstance(data, list):
            return {
                "online": True,
                "message": "MoviePilot 连接成功",
                "torrent_count": len(data),
            }

        return {"online": False, "message": "MoviePilot 返回了意外的数据格式"}

    async def search(self, keyword: str) -> list[dict]:
        """Search torrents across all configured PT sites.

        GET /api/v1/search/title?keyword={keyword}

        MoviePilot v2 Response format::

            {
              "success": true,
              "data": [
                {
                  "meta_info": {"title": "...", "year": "..."},
                  "media_info": {"title": "...", "tmdb_id": ...},
                  "torrent_info": {
                    "title": "...",
                    "site_name": "...",     # PT site display name
                    "size": 1234567890,       # bytes
                    "seeders": 10,
                    "peers": 2,               # leechers
                    "enclosure": "...",       # download URL
                    "page_url": "...",        # torrent detail page
                    "pubdate": "...",
                    "uploadvolumefactor": 0,  # 0 = free
                    "downloadvolumefactor": 1
                  }
                }
              ]
            }

        Returns a normalised list of dicts with consistent field names.
        """
        if not keyword.strip():
            return []

        data = await self._get("/api/v1/search/title", params={"keyword": keyword.strip()})
        if data is None:
            logger.debug("MP search returned None (HTTP error)")
            return []

        # The API wraps results in {"success": true, "data": [...]}
        raw_items = []
        if isinstance(data, dict):
            if data.get("success") and "data" in data:
                raw_items = data["data"]
                logger.debug("MP search: got %s results from 'data' key", len(raw_items))
            else:
                logger.debug("MP search: unexpected dict keys=%s", list(data.keys()))
        elif isinstance(data, list):
            raw_items = data
        else:
            logger.debug("MP search: unexpected type=%s", type(data).__name__)

        if not raw_items:
            return []

        results = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            ti = item.get("torrent_info") or {}
            mi = item.get("meta_info") or {}

            # Determine the display title (torrent name, fallback to meta title)
            title = ti.get("title") or mi.get("title") or ""
            if not title:
                continue

            # Compute promotion status from volume factors
            uvf = ti.get("uploadvolumefactor")
            dvf = ti.get("downloadvolumefactor")
            is_free = (uvf is not None and uvf == 0) or (dvf is not None and dvf == 0)

            results.append({
                "title": title,
                "site": ti.get("site_name") or "",
                "size": int(ti.get("size") or 0),
                "seeders": int(ti.get("seeders") or 0),
                "leechers": int(ti.get("peers") or 0),
                "download_url": ti.get("enclosure") or "",
                "page_url": ti.get("page_url") or "",
                "pub_date": ti.get("pubdate") or "",
                "is_free": is_free,
                # Pass raw factors so the frontend can render rich promotion labels
                "uploadvolumefactor": uvf,
                "downloadvolumefactor": dvf,
            })

        return results

    async def download(self, title: str, url: str, save_path: str = "") -> dict:
        """Send a torrent to MoviePilot's downloader (qBittorrent).

        POST /api/v1/download/add

        The request body must be wrapped in a ``torrent_in`` object per
        MoviePilot's OpenAPI schema.

        Returns:
            {"success": true, "hash": "...", "message": "..."}
            or {"success": false, "message": "..."}
        """
        payload: dict[str, Any] = {
            "torrent_in": {
                "title": title,
                "url": url,
            }
        }
        if save_path:
            payload["torrent_in"]["save_path"] = save_path

        data = await self._post("/api/v1/download/add", json_data=payload)
        if data is None:
            return {"success": False, "hash": "", "message": "添加下载任务失败，请检查 MoviePilot 连接"}

        return {
            "success": data.get("success", False),
            "hash": data.get("hash", ""),
            "message": data.get("message", "添加成功" if data.get("success") else "添加失败"),
        }

    async def get_torrents(self) -> list[dict]:
        """Get the current download queue from MoviePilot.

        GET /api/v1/download/

        Returns a list of torrents with fields normalised to match the
        ``MoviePilotTorrent`` frontend type.
        """
        data = await self._get("/api/v1/download/")
        if data is None:
            return []

        torrents = data if isinstance(data, list) else []
        return [
            {
                "hash": t.get("hash", ""),
                "name": t.get("name", ""),
                "status": t.get("state", "unknown"),  # downloading/seeding/paused/error
                "progress": t.get("progress", 0.0) / 100.0,  # API returns 0-100 → normalise to 0-1
                "size": t.get("size", 0),
                "downloaded": int(t.get("progress", 0) * t.get("size", 0) / 100.0),  # derive from progress
                "dlspeed": _parse_mp_speed(t.get("dlspeed", "0B")),  # bytes/s
                "ulspeed": _parse_mp_speed(t.get("ulspeed", "0B")),  # bytes/s
                "seeders": 0,  # not provided by this API version
                "save_path": t.get("save_path", ""),
            }
            for t in torrents
            if t.get("hash")
        ]
