"""Pydantic API schemas (request / response models)."""

from typing import Optional

from sqlmodel import SQLModel, Field


# ============================================
# Auth Schemas
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
# Media / Recommendation Schemas
# ============================================


class MediaRating(SQLModel):
    """A single media item with its user rating."""
    title: str = Field(description="Media title")
    rating: float = Field(ge=0.0, le=10.0, description="User rating (0-10)")
    year: Optional[int] = Field(None, description="Release year")
    genre: Optional[str] = Field(None, description="Genre(s)")


class WishlistItem(SQLModel):
    """A single media item for the wishlist (no rating)."""
    title: str = Field(description="Media title")
    year: Optional[int] = Field(None, description="Release year")
    genre: Optional[str] = Field(None, description="Genre(s)")


class WishlistData(SQLModel):
    """Input data: list of items for the wishlist."""
    movies: list[WishlistItem]


class MarkAsWatchedRequest(SQLModel):
    """Request body for marking a wishlist item as watched."""
    rating: float = Field(ge=0.0, le=10.0, default=5.0, description="Rating after watching")


class MediaData(SQLModel):
    """Input data: list of media items with user ratings."""
    movies: list[MediaRating]


class StrategyParams(SQLModel):
    """Optional parameters for specific recommendation strategies."""
    mood: Optional[str] = Field(None, description="Mood description for mood-based recommendations")
    year_start: Optional[int] = Field(None, description="Start year for era-based recommendations")
    year_end: Optional[int] = Field(None, description="End year for era-based recommendations")
    target_genre: Optional[str] = Field(None, description="Target genre for explore-new-genre strategy")


class RecommendationRequest(SQLModel):
    """Request body for generating recommendations."""
    movies: list[MediaRating]
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


class MediaRecommendation(SQLModel):
    """A single media recommendation."""
    title: str
    year: Optional[int] = None
    genre: Optional[str] = None
    reason: str = Field(description="Why this is recommended")
    confidence: float = Field(
        ge=0.0, le=1.0, description="Confidence score 0-1"
    )


class RecommendationResponse(SQLModel):
    """Response containing recommendations."""
    recommendations: list[MediaRecommendation]
    model_used: str
    source_count: int


class ConversationMessage(SQLModel):
    """A single message in the conversation history."""
    role: str = Field(description="'user' or 'assistant'")
    content: str = Field(description="Message content")


class FollowUpRequest(SQLModel):
    """Request body for follow-up conversation."""
    movies: list[MediaRating]
    previous_recommendations: list[MediaRecommendation]
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
