"""Plex media server connector implementation.

Plex exposes a REST API authenticated with an ``X-Plex-Token`` header.
Unlike Jellyfin, Plex has no per-user API path requirement — the token
scopes the requests server-side, so ``get_user_id()`` simply returns "".

JSON responses are requested via the ``Accept: application/json`` header.
"""

import logging
from typing import Optional

import httpx

from .base import BaseConnector, LibraryInfo, ServerStatus

logger = logging.getLogger(__name__)


# ── Shared HTTP client with connection pooling ─────────────────────

_shared_plex_client: httpx.AsyncClient | None = None


def _get_plex_client() -> httpx.AsyncClient:
    global _shared_plex_client
    if _shared_plex_client is None:
        _shared_plex_client = httpx.AsyncClient(timeout=10.0)
    return _shared_plex_client


async def close_plex_client():
    """Close the shared HTTP client (call on app shutdown)."""
    global _shared_plex_client
    if _shared_plex_client is not None:
        await _shared_plex_client.aclose()
        _shared_plex_client = None


def _normalize_media_type(plex_type: str) -> str:
    """Map a Plex library type to the app's ``movie`` / ``tv`` vocabulary."""
    t = (plex_type or "").lower()
    if t in ("movie", "clip"):
        return "movie"
    if t in ("show", "series", "season", "episode"):
        return "tv"
    return "other"


class PlexConnector(BaseConnector):
    """Connector for Plex media servers."""

    def _build_headers(self) -> dict[str, str]:
        return {
            "X-Plex-Token": self.api_key,
            "X-Plex-Product": "Xplora",
            "X-Plex-Version": "1.0.0",
            "X-Plex-Client-Identifier": "xplora-001",
            "Accept": "application/json",
        }

    # ── Helpers ───────────────────────────────────────────────────

    async def _get_json(self, path: str, params: dict | None = None) -> dict | None:
        """Send an authenticated GET request and parse the JSON body."""
        url = f"{self.base_url}{path}"
        client = _get_plex_client()
        try:
            resp = await client.get(url, headers=self._build_headers(), params=params)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            logger.warning("Plex HTTP error %s: %s — %s", e.response.status_code, url, e.response.text[:200])
            return None
        except (httpx.RequestError, ValueError) as e:
            logger.warning("Plex request failed: %s — %s", url, e)
            return None

    # ── Public API ────────────────────────────────────────────────

    async def test_connection(self) -> ServerStatus:
        """Ping Plex — ``GET /`` returns identity info in MediaContainer."""
        data = await self._get_json("/")
        if data is None:
            return ServerStatus(online=False, message="无法连接服务器，请检查地址、端口和 Token")

        container = data.get("MediaContainer", {}) if isinstance(data, dict) else {}
        version = container.get("version", "")
        server_name = container.get("friendlyName", "Plex")
        return ServerStatus(
            online=True,
            version=version,
            server_name=server_name,
            message=f"已连接 {server_name} (v{version})",
        )

    async def get_user_id(self) -> str:
        """Plex tokens are server-scoped — no user ID needed."""
        return ""

    async def get_libraries(self) -> list[LibraryInfo]:
        """Fetch media libraries (sections) — ``GET /library/sections``."""
        data = await self._get_json("/library/sections")
        if data is None:
            return []

        container = data.get("MediaContainer", {})
        directories = container.get("Directory", []) if isinstance(container, dict) else []
        libraries: list[LibraryInfo] = []
        for d in directories:
            if not isinstance(d, dict):
                continue
            lib_id = str(d.get("key", "") or d.get("id", ""))
            if not lib_id:
                continue
            title = d.get("title", "Untitled")
            raw_type = d.get("type", "")
            media_type = {
                "movie": "movies",
                "show": "shows",
                "artist": "music",
            }.get(raw_type, "other")
            libraries.append(LibraryInfo(
                id=lib_id,
                name=title,
                media_type=media_type,
                item_count=int(d.get("Size", 0) or 0),
            ))
        return libraries

    async def refresh_library(self, library_id: str) -> bool:
        """Trigger a library scan — ``GET /library/sections/{id}/refresh``."""
        url = f"{self.base_url}/library/sections/{library_id}/refresh"
        client = _get_plex_client()
        try:
            resp = await client.get(url, headers=self._build_headers())
            return resp.status_code in (200, 201)
        except httpx.RequestError as e:
            logger.warning("Plex refresh failed: %s — %s", url, e)
            return False

    async def search(self, query: str, library_id: Optional[str] = None) -> list[dict]:
        """Search media on the server — ``GET /search?query=...``."""
        params: dict[str, str | int] = {"query": query, "limit": 20}
        path = "/search"
        if library_id:
            # Scope the search to a specific section
            path = f"/library/sections/{library_id}/search"

        data = await self._get_json(path, params=params)
        if data is None:
            return []

        container = data.get("MediaContainer", {})
        items = container.get("Metadata", []) if isinstance(container, dict) else []
        results: list[dict] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            title = item.get("title", "")
            if not title:
                continue
            media_type = _normalize_media_type(item.get("type", "movie"))
            results.append({
                "id": str(item.get("ratingKey", "")),
                "title": title,
                "year": item.get("year"),
                "media_type": media_type,
                "index_number": item.get("index"),
                "parent_index_number": item.get("parentIndex"),
                "series": item.get("grandparentTitle"),
                "image_tags": {"primary": item.get("thumb") or ""},
            })
        return results

    async def get_library_items(self, library_id: str, limit: int = 50, start_index: int = 0) -> list[dict]:
        """Fetch media items from a specific library section.

        ``GET /library/sections/{id}/all?X-Plex-Container-Start=&Size=&includeGuids=1``

        Returns a list of items plus ``_total_record_count`` as the last
        pseudo-item (same convention as the Jellyfin connector).
        """
        params: dict[str, str | int] = {
            "X-Plex-Container-Start": start_index,
            "X-Plex-Container-Size": limit,
            "includeGuids": 1,
        }
        data = await self._get_json(f"/library/sections/{library_id}/all", params=params)
        if data is None:
            return []

        container = data.get("MediaContainer", {})
        items = container.get("Metadata", []) if isinstance(container, dict) else []
        total = int(container.get("totalSize", 0) or 0)

        results: list[dict] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            title = item.get("title", "")
            if not title:
                continue
            results.append({
                "id": str(item.get("ratingKey", "")),
                "title": title,
                "year": item.get("year"),
                "media_type": _normalize_media_type(item.get("type", "movie")),
                "overview": item.get("summary"),
                "runtime": item.get("duration"),
                "image_tags": {"primary": item.get("thumb") or ""},
            })
        results.append({"_total_record_count": total})
        return results

    async def get_watched_items(self) -> list[dict]:
        """Fetch all played media items from every movie/TV section.

        Uses ``unwatched=0`` to ask Plex for watched items, and also
        falls back to filtering ``viewCount > 0`` for robustness across
        Plex versions. Paginates with container params.
        """
        libraries = await self.get_libraries()
        movie_sections = [lib.id for lib in libraries if lib.media_type in ("movies", "shows")]
        results: list[dict] = []
        page_size = 200

        for section_id in movie_sections:
            start = 0
            total = None
            while total is None or start < total:
                params: dict[str, str | int] = {
                    "unwatched": 0,
                    "includeGuids": 1,
                    "X-Plex-Container-Start": start,
                    "X-Plex-Container-Size": page_size,
                }
                data = await self._get_json(f"/library/sections/{section_id}/all", params=params)
                if data is None:
                    break
                container = data.get("MediaContainer", {}) if isinstance(data, dict) else {}
                if total is None:
                    total = int(container.get("totalSize", 0) or 0)
                items = container.get("Metadata", []) if isinstance(container, dict) else []
                if not items:
                    break
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    # Only keep items that are actually watched
                    if not (int(item.get("viewCount", 0) or 0) > 0):
                        continue
                    title = item.get("title", "")
                    if not title:
                        continue
                    media_type = _normalize_media_type(item.get("type", "movie"))
                    results.append({
                        "title": title,
                        "year": item.get("year"),
                        "media_type": media_type,
                        "overview": item.get("summary"),
                        "server_item_id": str(item.get("ratingKey", "")),
                    })
                start += page_size
                if len(items) < page_size:
                    break

        logger.info("Fetched %d watched items from Plex", len(results))
        return results
