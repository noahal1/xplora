"""Abstract base class for media server connectors."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class LibraryInfo:
    """Represents a media library on the server."""
    id: str
    name: str
    media_type: str  # "movies" | "shows" | "music" | etc.
    item_count: int = 0


@dataclass
class ServerStatus:
    """Health check result for a media server connection."""
    online: bool
    version: str = ""
    server_name: str = ""
    message: str = ""


class BaseConnector(ABC):
    """Abstract connector that every media-server adapter must implement.

    Subclasses override the abstract methods, and the router calls them
    polymorphically so the frontend never needs to know which server
    type is behind the connection.
    """

    def __init__(self, host: str, port: int, api_key: str, use_ssl: bool = False):
        self.host = host
        self.port = port
        self.api_key = api_key
        self.use_ssl = use_ssl

    # ── Properties ────────────────────────────────────────────────

    @property
    def base_url(self) -> str:
        scheme = "https" if self.use_ssl else "http"
        return f"{scheme}://{self.host}:{self.port}"

    # ── Abstract methods ──────────────────────────────────────────

    @abstractmethod
    async def test_connection(self) -> ServerStatus:
        """Ping the server and return its status."""
        ...

    @abstractmethod
    async def get_libraries(self) -> list[LibraryInfo]:
        """Return a list of all media libraries on the server."""
        ...

    @abstractmethod
    async def refresh_library(self, library_id: str) -> bool:
        """Trigger a scan of the specified media library."""
        ...

    @abstractmethod
    async def search(self, query: str, library_id: Optional[str] = None) -> list[dict]:
        """Search for media items across the server (or within a specific library)."""
        ...

    @abstractmethod
    async def get_user_id(self) -> str:
        """Return the primary user ID used for API calls (Jellyfin-specific)."""
        ...
