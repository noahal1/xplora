"""SQLModel ORM table models (database-backed)."""

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field, Relationship


class UserRecord(SQLModel, table=True):
    """A registered user."""

    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(max_length=64, unique=True, nullable=False, index=True)
    password_hash: str = Field(max_length=256, nullable=False)
    is_admin: bool = Field(default=False, nullable=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)

    media: list["MediaItemRecord"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    sessions: list["SessionRecord"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class MediaItemRecord(SQLModel, table=True):
    """A media item (movie or TV series) that the user has imported — either watched (rated) or wishlisted."""

    __tablename__ = "media_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(max_length=255, nullable=False, index=True)
    rating: float = Field(nullable=False, default=5.0)
    year: Optional[int] = Field(default=None, nullable=True)
    genre: Optional[str] = Field(default=None, max_length=255, nullable=True)
    status: str = Field(
        default="watched", max_length=20, nullable=False, index=True
    )  # "watched" or "wish"
    notes: Optional[str] = Field(default=None, max_length=500, nullable=True)

    # === Metadata fields (populated by TMDB / OMDb scraping) ===
    poster_url: Optional[str] = Field(default=None, max_length=500, nullable=True)
    overview: Optional[str] = Field(default=None, nullable=True)
    runtime: Optional[int] = Field(default=None, nullable=True)
    imdb_id: Optional[str] = Field(default=None, max_length=50, nullable=True)
    tmdb_id: Optional[str] = Field(default=None, max_length=50, nullable=True)
    country: Optional[str] = Field(default=None, max_length=100, nullable=True)
    tagline: Optional[str] = Field(default=None, max_length=500, nullable=True)
    scrape_error: Optional[str] = Field(default=None, nullable=True)
    media_type: str = Field(default="movie", max_length=10, nullable=False, index=True)

    # === TV series-specific fields (only used when media_type="tv") ===
    tv_series_id: Optional[str] = Field(default=None, max_length=50, nullable=True)
    season_number: Optional[int] = Field(default=None, nullable=True)
    episode_count: Optional[int] = Field(default=None, nullable=True)
    series_poster_url: Optional[str] = Field(default=None, max_length=500, nullable=True)

    # === Top 10 customization ===
    pinned: bool = Field(default=False, nullable=False)
    hidden_from_top: bool = Field(default=False, nullable=False)
    sort_order: Optional[int] = Field(default=None, nullable=True)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)

    user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    user: Optional[UserRecord] = Relationship(back_populates="media")


class SessionRecord(SQLModel, table=True):
    """A recommendation session — captures the context of a single AI recommend run."""

    __tablename__ = "sessions"

    id: Optional[int] = Field(default=None, primary_key=True)
    model: str = Field(max_length=50, nullable=False, default="deepseek")
    source_count: int = Field(nullable=False, default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)

    user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    user: Optional[UserRecord] = Relationship(back_populates="sessions")

    recommendations: list["RecommendationRecord"] = Relationship(
        back_populates="session",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class RecommendationRecord(SQLModel, table=True):
    """A single movie recommendation from the AI."""

    __tablename__ = "recommendations"

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(max_length=255, nullable=False)
    year: Optional[int] = Field(default=None, nullable=True)
    genre: Optional[str] = Field(default=None, max_length=255, nullable=True)
    reason: str = Field(nullable=False, default="")
    confidence: float = Field(nullable=False, default=0.0)
    tmdb_id: Optional[str] = Field(default=None, max_length=50, nullable=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)

    session_id: int = Field(foreign_key="sessions.id", nullable=False)
    session: Optional[SessionRecord] = Relationship(back_populates="recommendations")


class OperationLogRecord(SQLModel, table=True):
    """Audit log for user operations."""

    __tablename__ = "operation_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    username: str = Field(max_length=64, nullable=False)
    action: str = Field(max_length=64, nullable=False, index=True)
    detail: Optional[str] = Field(default=None, max_length=500, nullable=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)


class MediaServerRecord(SQLModel, table=True):
    """A media server (Plex / Jellyfin / FeiNiu) linked to a user account."""

    __tablename__ = "media_servers"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    name: str = Field(max_length=128, nullable=False, description="User-given alias, e.g. 'My FeiNiu'")
    server_type: str = Field(max_length=32, nullable=False, description="'jellyfin' or 'feiniu'")
    host: str = Field(max_length=255, nullable=False, description="IP or hostname")
    port: int = Field(default=8096, nullable=False, description="Port number")
    api_key: str = Field(max_length=512, nullable=False, description="Encrypted API key / token")
    username: Optional[str] = Field(default=None, max_length=128, nullable=True, description="Username for FeiNiu auth")
    server_user_id: Optional[str] = Field(default=None, max_length=64, nullable=True, description="User ID on media server (cached from auth)")
    use_ssl: bool = Field(default=False, nullable=False)
    is_active: bool = Field(default=True, nullable=False)
    last_connected: Optional[datetime] = Field(default=None, nullable=True)
    last_synced: Optional[datetime] = Field(default=None, nullable=True, description="When library cache was last synced")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)


class MediaServerLibraryCache(SQLModel, table=True):
    """Cached titles from a media server's libraries for fast matching.

    Populated by ``POST /api/media-servers/{id}/sync-library``.  This
    avoids repeatedly fetching all items from the media server API just
    to see if a wishlist item is available for download.
    """

    __tablename__ = "media_server_library_cache"

    id: Optional[int] = Field(default=None, primary_key=True)
    server_id: int = Field(foreign_key="media_servers.id", nullable=False, index=True)
    user_id: int = Field(nullable=False, index=True)
    title: str = Field(max_length=512, nullable=False)
    normalized_title: str = Field(max_length=512, nullable=False, index=True, description="lowercase stripped version for matching")
    year: Optional[int] = Field(default=None, nullable=True)
    server_item_id: str = Field(max_length=64, nullable=False)
    media_type: str = Field(max_length=16, default="movie", nullable=False)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)


class MoviePilotRecord(SQLModel, table=True):
    """MoviePilot connection configuration per user."""

    __tablename__ = "moviepilot_connections"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    name: str = Field(max_length=128, default="MoviePilot")
    host: str = Field(max_length=255, default="localhost")
    port: int = Field(default=3000)
    api_token: str = Field(max_length=512)
    use_ssl: bool = Field(default=False)
    is_active: bool = Field(default=True)
    last_connected: Optional[datetime] = Field(default=None, nullable=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)
