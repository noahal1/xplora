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

    def __init__(self, host: str, port: int, api_key: str, use_ssl: bool = False, user_id: str | None = None):
        super().__init__(host, port, api_key, use_ssl)
        # Cached user ID from auth response (avoids needing GET /Users
        # which FeiNiu's SPA intercepts).
        self._user_id: str | None = user_id

    def _build_headers(self) -> dict[str, str]:
        client_info = 'MediaBrowser Client="Xplora", Device="Xplora", DeviceId="xplora-001", Version="1.0.0"'
        return {
            "Authorization": f'{client_info}, Token="{self.api_key}"',
            "X-Emby-Authorization": f'{client_info}, Token="{self.api_key}"',
            "Accept": "application/json",
        }

    # ── Helpers ───────────────────────────────────────────────────

    async def _get(self, path: str, params: dict | None = None) -> dict | list | None:
        """Send an authenticated GET request; falls back to POST if the
        response is not JSON (FeiNiu SPA intercepts some GET routes).
        """
        url = f"{self.base_url}{path}"
        headers = self._build_headers()
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=headers, params=params)
                resp.raise_for_status()

                # Check if response is JSON
                ct = resp.headers.get("content-type", "")
                if "application/json" in ct or resp.text[:1] in ("{", "["):
                    try:
                        return resp.json()
                    except Exception:
                        pass

                # Non-JSON (FeiNiu SPA) → retry with POST
                logger.info("GET returned %s from %s, retrying POST…", ct or "non-JSON", url)
                resp2 = await client.post(url, headers=headers, params=params)
                resp2.raise_for_status()
                try:
                    return resp2.json()
                except Exception as json_err:
                    logger.warning("POST fallback also non-JSON from %s: %s", url, json_err)
                    return None

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

    # ── Authentication ────────────────────────────────────────────

    async def authenticate(self, username: str, password: str) -> str | None:
        """Authenticate with username/password (FeiNiu login).

        POST /Users/AuthenticateByName to get an AccessToken (Jellyfin
        protocol).  Requires the X-Emby-Authorization header even before
        a token is obtained.  Also caches the user ID from the response.
        """
        url = f"{self.base_url}/Users/AuthenticateByName"
        headers = {
            "X-Emby-Authorization": 'MediaBrowser Client="Xplora", Device="Xplora", DeviceId="xplora-001", Version="1.0.0"',
            "Accept": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    url,
                    headers=headers,
                    json={"Username": username, "Pw": password},
                )
                if resp.status_code == 200:
                    try:
                        data = resp.json()
                    except Exception as json_err:
                        logger.warning("FeiNiu auth: invalid JSON in response (status=200): %s — body=%s", json_err, resp.text[:300])
                        return None
                    token = data.get("AccessToken")
                    if token:
                        # Cache user ID from auth response
                        user_obj = data.get("User") if isinstance(data, dict) else {}
                        self._user_id = str(user_obj.get("Id", "")) if isinstance(user_obj, dict) else None
                        logger.info("FeiNiu auth succeeded, got AccessToken (user_id=%s)", self._user_id)
                        return str(token)
                logger.warning("FeiNiu auth failed: status=%s body=%s", resp.status_code, resp.text[:300])
                return None
        except httpx.RequestError as e:
            logger.warning("FeiNiu auth request failed: %s", e)
            return None

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
        """Get the first user ID — prefers cached value from auth response."""
        if self._user_id:
            return self._user_id
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

    async def get_watched_items(self) -> list[dict]:
        """Fetch all played/watched media items from the server.

        GET /Users/{user_id}/Items?Filters=IsPlayed&Recursive=true&Fields=
        ProviderIds,Overview&Limit=500

        Returns a list of items with title, year, etc.
        """
        user_id = await self.get_user_id()
        if not user_id:
            logger.warning("No user ID found — cannot fetch watched items")
            return []

        params = {
            "Filters": "IsPlayed",
            "Recursive": "true",
            "Fields": "ProviderIds,Overview",
            "Limit": 500,
            "SortBy": "DatePlayed",
            "SortOrder": "Descending",
        }
        path = f"/Users/{user_id}/Items"
        data = await self._get(path, params=params)
        if data is None:
            return []

        items = data.get("Items", []) if isinstance(data, dict) else []
        results: list[dict] = []
        for item in items:
            title = item.get("Name", "") or ""
            year = item.get("ProductionYear")
            # Skip items without a title
            if not title:
                continue
            results.append({
                "title": title,
                "year": year,
                "media_type": item.get("Type", "").lower() if item.get("Type") else "movie",
                "overview": item.get("Overview"),
                "server_item_id": item.get("Id", ""),
            })

        logger.info("Fetched %d watched items from media server", len(results))
        return results

    async def get_library_items(self, library_id: str, limit: int = 50, start_index: int = 0) -> list[dict]:
        """Fetch media items from a specific library.

        GET /Users/{user_id}/Items?ParentId={library_id}&Recursive=true&
        Limit={limit}&StartIndex={start_index}&SortBy=SortName&SortOrder=Ascending

        Returns a list of items with title, year, type, etc., plus
        ``total_count`` as the last dict in the list (with key
        ``_total_record_count``) so the caller knows the total.
        """
        user_id = await self.get_user_id()
        if not user_id:
            logger.warning("No user ID found — cannot fetch library items")
            return []

        params = {
            "ParentId": library_id,
            "Recursive": "true",
            "Limit": limit,
            "StartIndex": start_index,
            "SortBy": "SortName",
            "SortOrder": "Ascending",
            "Fields": "PrimaryImageAspectRatio,Overview",
        }
        path = f"/Users/{user_id}/Items"
        data = await self._get(path, params=params)
        if data is None:
            return []

        items = data.get("Items", []) if isinstance(data, dict) else []
        total = data.get("TotalRecordCount", 0) if isinstance(data, dict) else 0

        results: list[dict] = []
        for item in items:
            title = item.get("Name", "") or ""
            if not title:
                continue
            results.append({
                "id": item.get("Id", ""),
                "title": title,
                "year": item.get("ProductionYear"),
                "media_type": item.get("Type", "").lower() if item.get("Type") else "movie",
                "overview": item.get("Overview"),
                "runtime": item.get("RunTimeTicks"),
                "image_tags": item.get("ImageTags", {}),
            })

        logger.info("Fetched %d/%d items from library %s", len(results), total, library_id)
        # Append total count as pseudo-item
        results.append({"_total_record_count": total})
        return results

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
