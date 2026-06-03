# Re-exports from db and schemas submodules.
# Existing code can still `from models import UserRecord, ...`

from models.db import (
    UserRecord,
    MovieRecord,
    SessionRecord,
    RecommendationRecord,
    OperationLogRecord,
)

from models.schemas import (
    LoginRequest,
    LoginResponse,
    CreateUserRequest,
    UserInfo,
    ChangePasswordRequest,
    MovieRating,
    WishlistItem,
    WishlistData,
    MarkAsWatchedRequest,
    MovieData,
    StrategyParams,
    RecommendationRequest,
    MovieRecommendation,
    RecommendationResponse,
    ConversationMessage,
    FollowUpRequest,
)

__all__ = [
    "UserRecord",
    "MovieRecord",
    "SessionRecord",
    "RecommendationRecord",
    "OperationLogRecord",
    "LoginRequest",
    "LoginResponse",
    "CreateUserRequest",
    "UserInfo",
    "ChangePasswordRequest",
    "MovieRating",
    "WishlistItem",
    "WishlistData",
    "MarkAsWatchedRequest",
    "MovieData",
    "StrategyParams",
    "RecommendationRequest",
    "MovieRecommendation",
    "RecommendationResponse",
    "ConversationMessage",
    "FollowUpRequest",
]
