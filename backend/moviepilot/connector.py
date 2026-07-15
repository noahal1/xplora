"""Connector for MoviePilot PT download REST API.

MoviePilot is a self-hosted PT (Private Tracker) download management
service. Xplora communicates with it via its REST API to search torrents,
trigger downloads, and query download status.

API Reference (based on MoviePilot source code):
    GET  /api/v1/search/title?keyword=xxx&token=xxx  → search torrents
    POST /api/v1/download/add?token=xxx               → add download task
    GET  /api/v1/torrent/state?token=xxx              → query download queue
"""

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

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
        """Build a full URL with the API token."""
        sep = "&" if "?" in path else "?"
        return f"{self.base_url}{path}{sep}token={self.api_token}"

    # ── HTTP helpers ──────────────────────────────────────────────

    async def _get(self, path: str, params: dict | None = None) -> dict | list | None:
        """Send an authenticated GET request."""
        url = self._build_url(path)
        client = _get_client()
        try:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            logger.warning("MP HTTP error %s: %s — %s", e.response.status_code, url, e.response.text[:200])
            return None
        except httpx.RequestError as e:
            logger.warning("MP request failed: %s — %s", url, e)
            return None

    async def _post(self, path: str, json_data: dict | None = None) -> dict | None:
        """Send an authenticated POST request."""
        url = self._build_url(path)
        client = _get_client()
        try:
            resp = await client.post(url, json=json_data)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            logger.warning("MP POST error %s: %s — %s", e.response.status_code, url, e.response.text[:200])
            return None
        except httpx.RequestError as e:
            logger.warning("MP POST failed: %s — %s", url, e)
            return None

    # ── Public API ────────────────────────────────────────────────

    async def test_connection(self) -> dict:
        """Test the connection to MoviePilot by fetching torrent state.

        We use GET /api/v1/torrent/state as a health check since it
        requires authentication and returns a structured response
        (even if empty). If the server responds, the connection is valid.
        """
        data = await self._get("/api/v1/torrent/state")
        if data is None:
            return {"online": False, "message": "无法连接 MoviePilot，请检查地址、端口和 API Token"}

        if isinstance(data, dict):
            # Check for error responses
            if data.get("code") and data["code"] != 0:
                return {"online": False, "message": f"MoviePilot 返回错误: {data.get('message', '未知错误')}"}
            torrents = data.get("torrents", []) if isinstance(data.get("torrents"), list) else []
            return {
                "online": True,
                "message": "MoviePilot 连接成功",
                "torrent_count": len(torrents),
            }

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

        Returns a list of search results with title, site, size,
        seeders, leechers, download_url, etc.
        """
        if not keyword.strip():
            return []

        data = await self._get("/api/v1/search/title", params={"keyword": keyword.strip()})
        if data is None:
            return []

        results = data.get("results", []) if isinstance(data, dict) else data if isinstance(data, list) else []
        return [
            {
                "title": r.get("title", ""),
                "site": r.get("site", ""),
                "size": r.get("size", 0),
                "seeders": r.get("seeders", 0),
                "leechers": r.get("leechers", 0),
                "download_url": r.get("download_url", ""),
                "page_url": r.get("page_url", ""),
                "pub_date": r.get("pub_date", ""),
                "is_free": r.get("status", 0) == 0,
            }
            for r in results
            if r.get("title")
        ]

    async def download(self, title: str, url: str, save_path: str = "") -> dict:
        """Send a torrent to MoviePilot's downloader (qBittorrent).

        POST /api/v1/download/add

        Returns:
            {"success": true, "hash": "...", "message": "..."}
            or {"success": false, "message": "..."}
        """
        payload: dict[str, Any] = {
            "title": title,
            "url": url,
        }
        if save_path:
            payload["save_path"] = save_path

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

        GET /api/v1/torrent/state

        Returns a list of torrents with hash, name, status, progress,
        size, downloaded, dlspeed, ulspeed, seeders, save_path.
        """
        data = await self._get("/api/v1/torrent/state")
        if data is None:
            return []

        torrents = data.get("torrents", []) if isinstance(data, dict) else data if isinstance(data, list) else []
        return [
            {
                "hash": t.get("hash", ""),
                "name": t.get("name", ""),
                "status": t.get("status", "unknown"),  # downloading/seeding/paused/error
                "progress": t.get("progress", 0.0),      # 0-1
                "size": t.get("size", 0),
                "downloaded": t.get("downloaded", 0),
                "dlspeed": t.get("dlspeed", 0),          # bytes/s
                "ulspeed": t.get("ulspeed", 0),          # bytes/s
                "seeders": t.get("seeders", 0),
                "save_path": t.get("save_path", ""),
            }
            for t in torrents
            if t.get("hash")
        ]
