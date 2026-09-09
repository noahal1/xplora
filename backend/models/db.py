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
    # True until the user has replaced an initial/default password (e.g. the
    # seeded admin account). While set, the account is locked out of all API
    # endpoints except login / me / password change.
    must_change_password: bool = Field(default=False, nullable=False)
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
    media_type: Optional[str] = Field(default=None, max_length=10, nullable=True)
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


class PlaylistRecord(SQLModel, table=True):
    """A user-curated playlist (片单) — a named collection of media items.

    Shareable via a random token (``share_token``); when set, anyone with
    the token can view the playlist read-only without authentication.
    """

    __tablename__ = "playlists"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    name: str = Field(max_length=100, nullable=False, description="Playlist name, e.g. 'Weekend Movies'")
    description: Optional[str] = Field(default=None, max_length=500, nullable=True)
    cover_url: Optional[str] = Field(default=None, max_length=500, nullable=True, description="Cover poster from the first item")
    share_token: Optional[str] = Field(default=None, max_length=64, nullable=True, index=True, description="Random public share token; null = not shared")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)

    items: list["PlaylistItemRecord"] = Relationship(
        back_populates="playlist",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class PlaylistItemRecord(SQLModel, table=True):
    """A single entry within a playlist.

    Stores a metadata snapshot (title/year/genre/poster/...) so items
    survive even if the source ``media_items`` row is deleted, and also
    keeps an optional ``media_id`` reference for opening the detail modal
    when the item originated from the user's library.
    """

    __tablename__ = "playlist_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    playlist_id: int = Field(foreign_key="playlists.id", nullable=False, index=True)
    # NOTE: media_id is intentionally NOT a foreign key — it's a best-effort
    # soft reference to a media_items row. Deleting a library item must NOT
    # fail or cascade into playlists; playlist items store their own snapshot.
    media_id: Optional[int] = Field(default=None, nullable=True, index=True)

    # ── Snapshot fields (independent of media_items) ──
    title: str = Field(max_length=255, nullable=False)
    year: Optional[int] = Field(default=None, nullable=True)
    genre: Optional[str] = Field(default=None, max_length=255, nullable=True)
    media_type: str = Field(default="movie", max_length=10, nullable=False)
    poster_url: Optional[str] = Field(default=None, max_length=500, nullable=True)
    overview: Optional[str] = Field(default=None, nullable=True)
    tmdb_id: Optional[str] = Field(default=None, max_length=50, nullable=True)
    country: Optional[str] = Field(default=None, max_length=100, nullable=True)
    note: Optional[str] = Field(default=None, max_length=500, nullable=True)
    sort_order: Optional[int] = Field(default=None, nullable=True)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)

    playlist: Optional[PlaylistRecord] = Relationship(back_populates="items")


class MediaServerRecord(SQLModel, table=True):
    """A media server (Plex / Jellyfin / FeiNiu) linked to a user account."""

    __tablename__ = "media_servers"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    name: str = Field(max_length=128, nullable=False, description="User-given alias, e.g. 'My FeiNiu'")
    server_type: str = Field(max_length=32, nullable=False, description="'jellyfin' or 'feiniu'")
    host: str = Field(max_length=255, nullable=False, description="IP or hostname")
    port: int = Field(default=8096, nullable=False, description="Port number")
    api_key: str = Field(max_length=512, nullable=False, description="Encrypted API key / token (Fernet, see crypto.py)")
    username: Optional[str] = Field(default=None, max_length=128, nullable=True, description="Username for FeiNiu auth")
    server_user_id: Optional[str] = Field(default=None, max_length=64, nullable=True, description="User ID on media server (cached from auth)")
    use_ssl: bool = Field(default=False, nullable=False)
    is_active: bool = Field(default=True, nullable=False)
    last_connected: Optional[datetime] = Field(default=None, nullable=True)
    last_synced: Optional[datetime] = Field(default=None, nullable=True, description="When library cache was last synced")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)

    @property
    def api_key_plain(self) -> str:
        """The decrypted API key / token (for connector calls, never serialized)."""
        from crypto import decrypt_secret

        return decrypt_secret(self.api_key)


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
    api_token: str = Field(max_length=512, description="Encrypted API token (Fernet, see crypto.py)")
    use_ssl: bool = Field(default=False)
    is_active: bool = Field(default=True)
    last_connected: Optional[datetime] = Field(default=None, nullable=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)

    @property
    def api_token_plain(self) -> str:
        """The decrypted API token (for connector calls, never serialized)."""
        from crypto import decrypt_secret

        return decrypt_secret(self.api_token)


# ============================================
# RAG User Profile Models
# ============================================


class UserProfileRecord(SQLModel, table=True):
    """Persistent user taste profile — structured JSON generated by LLM."""

    __tablename__ = "user_profiles"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", nullable=False, index=True, unique=True)

    # ── Core profile data ──
    profile_json: str = Field(nullable=False, default="{}", description="Structured taste profile JSON")

    # ── Metadata ──
    version: int = Field(default=1, nullable=False)
    movie_count_analyzed: int = Field(default=0, nullable=False)
    model_used: str = Field(max_length=50, nullable=False, default="deepseek")

    # ── Quick-access stats (no JSON parsing needed) ──
    avg_rating: float = Field(default=0.0, nullable=False)
    top_genres: str = Field(default="[]", nullable=False, max_length=1000)
    preferred_decades: str = Field(default="[]", nullable=False, max_length=500)
    preferred_countries: str = Field(default="[]", nullable=False, max_length=500)

    # ── Timestamps ──
    last_full_rebuild: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_incremental_update: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserMemoryRecord(SQLModel, table=True):
    """User taste memory — natural language preference signals for RAG retrieval."""

    __tablename__ = "user_memories"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", nullable=False, index=True)

    # ── Memory content ──
    memory_text: str = Field(nullable=False, max_length=2000)
    memory_type: str = Field(max_length=32, nullable=False, index=True)
    # Types: "preference" | "anti_preference" | "evolution" | "context" | "milestone"
    confidence: float = Field(default=0.8, nullable=False)

    # ── Related data ──
    related_movies: str = Field(default="[]", nullable=False, max_length=2000)
    source_ratings: str = Field(default="[]", nullable=False, max_length=2000)

    # ── Vector embedding for semantic retrieval ──
    embedding: Optional[str] = Field(default=None, nullable=True, max_length=10000)

    # ── Lifecycle ──
    is_active: bool = Field(default=True, nullable=False, index=True)
    superseded_by: Optional[int] = Field(default=None, nullable=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MovieEmbeddingRecord(SQLModel, table=True):
    """BGE-M3 vector embedding for a user's rated movie."""

    __tablename__ = "movie_embeddings"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    media_item_id: Optional[int] = Field(default=None, nullable=True, index=True)

    # ── Movie snapshot ──
    title: str = Field(max_length=255, nullable=False)
    year: Optional[int] = Field(default=None, nullable=True)
    genre: Optional[str] = Field(default=None, max_length=255)
    rating: float = Field(nullable=False)
    media_type: str = Field(default="movie", max_length=10, nullable=False)
    tmdb_id: Optional[str] = Field(default=None, max_length=50)

    # ── BGE-M3 embeddings ──
    embedding_dense: str = Field(nullable=False, max_length=10000, description="JSON-serialized 1024-dim dense vector")
    embedding_sparse: Optional[str] = Field(default=None, nullable=True, max_length=50000, description="JSON-serialized sparse weights")
    embedding_text: str = Field(nullable=False, max_length=2000, description="Text used to generate embedding")

    # ── Timestamps ──
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserPreferencesRecord(SQLModel, table=True):
    """Per-user preferences / feature toggles.

    Stores boolean flags and lightweight config that the user can
    toggle in the Settings page (e.g. RAG embedding, AI features).

    Exactly one row per user — created lazily on first write.
    """

    __tablename__ = "user_preferences"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", nullable=False, index=True, unique=True)

    # ── Feature toggles ──
    rag_enabled: bool = Field(default=True, nullable=False, description="Enable RAG-based taste profile and embedding pipeline")

    # ── Timestamps ──
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
