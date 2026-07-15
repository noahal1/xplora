# Re-exports from db and schemas submodules.
# Existing code can still `from models import UserRecord, ...`

from models.db import (
    UserRecord,
    MediaItemRecord,
    SessionRecord,
    RecommendationRecord,
    OperationLogRecord,
    MediaServerRecord,
    MoviePilotRecord,
)

from models.schemas import (
    LoginRequest,
    LoginResponse,
    CreateUserRequest,
    UserInfo,
    ChangePasswordRequest,
    MediaRating,
    WishlistItem,
    WishlistData,
    MarkAsWatchedRequest,
    MediaData,
    StrategyParams,
    RecommendationRequest,
    MediaRecommendation,
    RecommendationResponse,
    ConversationMessage,
    FollowUpRequest,
)

__all__ = [
    "UserRecord",
    "MediaItemRecord",
    "SessionRecord",
    "RecommendationRecord",
    "OperationLogRecord",
    "MediaServerRecord",
    "MoviePilotRecord",
    "LoginRequest",
    "LoginResponse",
    "CreateUserRequest",
    "UserInfo",
    "ChangePasswordRequest",
    "MediaRating",
    "WishlistItem",
    "WishlistData",
    "MarkAsWatchedRequest",
    "MediaData",
    "StrategyParams",
    "RecommendationRequest",
    "MediaRecommendation",
    "RecommendationResponse",
    "ConversationMessage",
    "FollowUpRequest",
]
