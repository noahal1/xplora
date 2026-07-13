"""Jellyfin (and FeiNiu-compatible) connector implementation.

飞牛影视 (FeiNiu) mimics the Jellyfin API protocol, so this connector
works with both Jellyfin servers and FeiNiu's built-in media library.
"""

import logging
from typing import Optional

import httpx

from .base import BaseConnector, LibraryInfo, ServerStatus

logger = logging.getLogger(__name__)


class JellyfinConnector(BaseConnector):
    """Connector for Jellyfin / FeiNiu media servers."""

    # Jellyfin API path constants
    SYSTEM_INFO_PATH = "/System/Info"
    USERS_PATH = "/Users"
    VIEWS_PATH = "/Users/{user_id}/Views"
    LIBRARY_REFRESH_PATH = "/Library/Refresh?ItemId={library_id}"
    SEARCH_HINTS_PATH = "/Search/Hints"

    def _build_headers(self) -> dict[str, str]:
        return {
            "Authorization": f'MediaBrowser Client="Xplora", Device="Xplora", DeviceId="xplora-001", Version="1.0.0", Token="{self.api_key}"',
            "Accept": "application/json",
        }

    # ── Helpers ───────────────────────────────────────────────────

    async def _get(self, path: str, params: dict | None = None) -> dict | list | None:
        """Send an authenticated GET request to the Jellyfin API."""
        url = f"{self.base_url}{path}"
        headers = self._build_headers()
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=headers, params=params)
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as e:
            logger.warning("Jellyfin HTTP error %s: %s — %s", e.response.status_code, url, e.response.text[:200])
            return None
        except httpx.RequestError as e:
            logger.warning("Jellyfin request failed: %s — %s", url, e)
            return None

    async def _post(self, path: str) -> bool:
        """Send an authenticated POST request; returns True on success."""
        url = f"{self.base_url}{path}"
        headers = self._build_headers()
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, headers=headers)
                resp.raise_for_status()
                return True
        except httpx.HTTPStatusError as e:
            logger.warning("Jellyfin POST error %s: %s", e.response.status_code, url)
            return False
        except httpx.RequestError as e:
            logger.warning("Jellyfin POST failed: %s — %s", url, e)
            return False

    # ── Public API ────────────────────────────────────────────────

    async def test_connection(self) -> ServerStatus:
        """Ping Jellyfin's /System/Info endpoint."""
        data = await self._get(self.SYSTEM_INFO_PATH)
        if data is None:
            return ServerStatus(online=False, message="无法连接服务器，请检查地址和端口")

        version = data.get("Version", "") if isinstance(data, dict) else ""
        server_name = data.get("ServerName", "Jellyfin") if isinstance(data, dict) else "Jellyfin"
        return ServerStatus(
            online=True,
            version=version,
            server_name=server_name,
            message=f"已连接 {server_name} (v{version})",
        )

    async def get_user_id(self) -> str:
        """Get the first user ID from the Jellyfin server."""
        data = await self._get(self.USERS_PATH)
        if isinstance(data, list) and data:
            return str(data[0].get("Id", ""))
        return ""

    async def get_libraries(self) -> list[LibraryInfo]:
        """Fetch media libraries (Views) from the server."""
        user_id = await self.get_user_id()
        if not user_id:
            logger.warning("No user ID found — cannot fetch libraries")
            return []

        path = self.VIEWS_PATH.format(user_id=user_id)
        data = await self._get(path)
        if data is None:
            return []

        items = data.get("Items", []) if isinstance(data, dict) else []
        libraries: list[LibraryInfo] = []
        for item in items:
            lib_id = item.get("Id", "")
            name = item.get("Name", "Untitled")
            collection_type = item.get("CollectionType", "")
            # Map Jellyfin collection types
            media_type = {"movies": "movies", "tvshows": "shows", "music": "music"}.get(
                collection_type, "other"
            )
            try:
                child_count = item.get("ChildCount", 0)
            except (TypeError, AttributeError):
                child_count = 0

            libraries.append(LibraryInfo(
                id=lib_id,
                name=name,
                media_type=media_type,
                item_count=child_count,
            ))

        return libraries

    async def refresh_library(self, library_id: str) -> bool:
        """Trigger a library scan by POSTing to /Library/Refresh."""
        path = self.LIBRARY_REFRESH_PATH.format(library_id=library_id)
        return await self._post(path)

    async def search(self, query: str, library_id: Optional[str] = None) -> list[dict]:
        """Search media on the server.

        If ``library_id`` is provided, also filters by that library's
        ID (Jellyfin supports this via the ``parentId`` parameter).
        """
        params: dict[str, str | int] = {
            "searchTerm": query,
            "limit": 20,
        }
        if library_id:
            params["parentId"] = library_id

        data = await self._get(self.SEARCH_HINTS_PATH, params=params)
        if data is None:
            return []

        items = data.get("SearchHints", []) if isinstance(data, dict) else []
        results: list[dict] = []
        for item in items:
            results.append({
                "id": item.get("ItemId", ""),
                "title": item.get("Name", ""),
                "year": item.get("ProductionYear"),
                "media_type": item.get("Type", "").lower(),
                "index_number": item.get("IndexNumber"),
                "parent_index_number": item.get("ParentIndexNumber"),
                "series": item.get("Series"),
                "image_tags": item.get("ImageTags", {}),
                "thumb": item.get("Thumb"),
                "backdrop": item.get("BackdropImageTag"),
            })

        return results
