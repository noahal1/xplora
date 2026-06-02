"""SQLModel ORM models and Pydantic API schemas for the movie recommender."""

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field, Relationship


# ============================================
# Table Models (DB) — SQLModel + SQLAlchemy
# ============================================


class UserRecord(SQLModel, table=True):
    """A registered user."""

    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(max_length=64, unique=True, nullable=False, index=True)
    password_hash: str = Field(max_length=256, nullable=False)
    is_admin: bool = Field(default=False, nullable=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)

    movies: list["MovieRecord"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    sessions: list["SessionRecord"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class MovieRecord(SQLModel, table=True):
    """A movie that the user has imported — either watched (rated) or wishlisted."""

    __tablename__ = "movies"

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
    director: Optional[str] = Field(default=None, max_length=255, nullable=True)
    actors: Optional[str] = Field(default=None, max_length=500, nullable=True)
    runtime: Optional[int] = Field(default=None, nullable=True)
    imdb_id: Optional[str] = Field(default=None, max_length=50, nullable=True)
    tmdb_id: Optional[str] = Field(default=None, max_length=50, nullable=True)
    country: Optional[str] = Field(default=None, max_length=100, nullable=True)
    awards: Optional[str] = Field(default=None, max_length=500, nullable=True)
    tagline: Optional[str] = Field(default=None, max_length=500, nullable=True)
    scrape_error: Optional[str] = Field(default=None, nullable=True)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)

    user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    user: Optional[UserRecord] = Relationship(back_populates="movies")

    session_id: Optional[int] = Field(
        default=None, foreign_key="sessions.id", nullable=True
    )
    session: Optional["SessionRecord"] = Relationship(back_populates="movies")


class SessionRecord(SQLModel, table=True):
    """A recommendation session — captures the context of a single AI recommend run."""

    __tablename__ = "sessions"

    id: Optional[int] = Field(default=None, primary_key=True)
    model: str = Field(max_length=50, nullable=False, default="deepseek")
    source_count: int = Field(nullable=False, default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)

    user_id: int = Field(foreign_key="users.id", nullable=False, index=True)
    user: Optional[UserRecord] = Relationship(back_populates="sessions")

    movies: list[MovieRecord] = Relationship(
        back_populates="session",
        sa_relationship_kwargs={"cascade": "save-update"},
    )
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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)

    session_id: int = Field(foreign_key="sessions.id", nullable=False)
    session: Optional[SessionRecord] = Relationship(back_populates="recommendations")


# ============================================
# Auth Schemas (request / response)
# ============================================


class LoginRequest(SQLModel):
    username: str = Field(description="Username")
    password: str = Field(description="Password")


class LoginResponse(SQLModel):
    token: str
    username: str
    is_admin: bool


class CreateUserRequest(SQLModel):
    username: str = Field(min_length=2, max_length=64, description="New username")
    password: str = Field(min_length=4, max_length=128, description="Password")


class UserInfo(SQLModel):
    id: int
    username: str
    is_admin: bool
    created_at: str


class ChangePasswordRequest(SQLModel):
    """Request body for changing password."""
    old_password: str = Field(description="Current password")
    new_password: str = Field(
        min_length=4, max_length=128, description="New password"
    )


# ============================================
# Movie / Recommendation Schemas
# ============================================


class MovieRating(SQLModel):
    """A single movie with its user rating."""
    title: str = Field(description="Movie title")
    rating: float = Field(ge=0.0, le=10.0, description="User rating (0-10)")
    year: Optional[int] = Field(None, description="Release year")
    genre: Optional[str] = Field(None, description="Movie genre(s)")


class WishlistItem(SQLModel):
    """A single movie for the wishlist (no rating)."""
    title: str = Field(description="Movie title")
    year: Optional[int] = Field(None, description="Release year")
    genre: Optional[str] = Field(None, description="Movie genre(s)")


class WishlistData(SQLModel):
    """Input data: list of movies for the wishlist."""
    movies: list[WishlistItem]


class MarkAsWatchedRequest(SQLModel):
    """Request body for marking a wishlist movie as watched."""
    rating: float = Field(ge=0.0, le=10.0, default=5.0, description="Rating after watching")


class MovieData(SQLModel):
    """Input data: list of movies with user ratings."""
    movies: list[MovieRating]


class StrategyParams(SQLModel):
    """Optional parameters for specific recommendation strategies."""
    mood: Optional[str] = Field(None, description="Mood description for mood-based recommendations")
    year_start: Optional[int] = Field(None, description="Start year for era-based recommendations")
    year_end: Optional[int] = Field(None, description="End year for era-based recommendations")
    target_genre: Optional[str] = Field(None, description="Target genre for explore-new-genre strategy")


class RecommendationRequest(SQLModel):
    """Request body for generating recommendations."""
    movies: list[MovieRating]
    model: str = Field(
        default="deepseek",
        description="AI model to use: 'deepseek' or 'openai'",
    )
    count: int = Field(
        default=5, ge=1, le=20, description="Number of recommendations to generate"
    )
    strategy: str = Field(
        default="taste",
        description="Recommendation strategy: 'taste', 'classics', 'mood', 'era', 'gems', 'explore'",
    )
    strategy_params: Optional[StrategyParams] = Field(
        None, description="Optional parameters for the strategy"
    )


class MovieRecommendation(SQLModel):
    """A single movie recommendation."""
    title: str
    year: Optional[int] = None
    genre: Optional[str] = None
    reason: str = Field(description="Why this movie is recommended")
    confidence: float = Field(
        ge=0.0, le=1.0, description="Confidence score 0-1"
    )


class RecommendationResponse(SQLModel):
    """Response containing movie recommendations."""
    recommendations: list[MovieRecommendation]
    model_used: str
    source_count: int


class ConversationMessage(SQLModel):
    """A single message in the conversation history."""
    role: str = Field(description="'user' or 'assistant'")
    content: str = Field(description="Message content")


class FollowUpRequest(SQLModel):
    """Request body for follow-up conversation."""
    movies: list[MovieRating]
    previous_recommendations: list[MovieRecommendation]
    conversation: list[ConversationMessage] = Field(
        default_factory=list,
        description="Previous follow-up conversation history",
    )
    question: str = Field(description="The follow-up question")
    model: str = Field(default="deepseek", description="AI model to use")
    count: int = Field(
        default=3, ge=1, le=10,
        description="Number of new recommendations if requested",
    )
