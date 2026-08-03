"""AI service for movie recommendations supporting DeepSeek and OpenAI models.

The ``AIService`` class is composed from feature-specific mixins so each
concern lives in its own module under this package.
"""

from .base import AIServiceBase
from .taste import TasteMixin
from .prompts import PromptMixin
from .tmdb import TMDCMixin
from .parsing import ParsingMixin
from .playlists import PlaylistMixin
from .filters import FilterMixin
from .recommend import RecommendMixin

__all__ = ["AIService"]


class AIService(
    AIServiceBase,
    TasteMixin,
    PromptMixin,
    TMDCMixin,
    ParsingMixin,
    PlaylistMixin,
    FilterMixin,
    RecommendMixin,
):
    """Service for generating movie recommendations using AI models."""
