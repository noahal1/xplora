"""AI service for movie recommendations supporting DeepSeek and OpenAI models.

The :class:`AIService` facade is intentionally DEEP: a small, deliberate
public interface backed by a large hidden implementation.  Internal helpers
(all ``_``-prefixed) live in a few cohesive mixin modules and are NOT part of
the supported surface.

Intended public interface
-------------------------
* ``get_recommendations(...)``        — synchronous recommendation generation
* ``get_recommendations_stream(...)`` — streaming recommendation generation
* ``get_followup_stream(...)``        — streaming follow-up recommendations
* ``get_local_recommendations(...)``  — local / TMDB-hybrid recommendations
* ``generate_playlist_names(...)``    — AI playlist name suggestions
* ``categorize_playlist(...)``        — AI playlist categorization
* ``complete_playlist(...)``          — AI playlist completion
* ``analyze_user_taste(movies)``      — public taste analysis (new in this
  refactor; wraps the internal ``_analyze_user_taste`` helper).  Routers
  should call this public name; ``_analyze_user_taste`` is kept as a
  backwards-compatible alias for existing callers.

Everything else (``_build_prompt``, ``_retry_loop``, ``_parse_response``,
``_analyze_user_taste``, ``_filter_watched``, ...) is an internal detail.
"""

from .base import AIServiceBase
from .prompts import PromptMixin
from .tmdb import TMDBMixin, TMDCMixin
from .playlists import PlaylistMixin
from .recommend import (
    RecommendMixin,
    ParsingMixin,
    TasteMixin,
    FilterMixin,
)

__all__ = [
    "AIService",
    "AIServiceBase",
    "PromptMixin",
    "TMDBMixin",
    "TMDCMixin",
    "PlaylistMixin",
    "RecommendMixin",
    "ParsingMixin",
    "TasteMixin",
    "FilterMixin",
]


class AIService(
    AIServiceBase,
    PromptMixin,
    TMDBMixin,
    PlaylistMixin,
    RecommendMixin,
):
    """Service for generating movie recommendations using AI models.

    Composed from five deep mixins (down from eight shallow ones).  The
    former ``TasteMixin`` / ``ParsingMixin`` / ``FilterMixin`` are now folded
    into :class:`~.recommend.RecommendMixin`; their names remain importable
    as backwards-compatible aliases (see ``__all__``).
    """

    def analyze_user_taste(self, movies: list) -> dict:
        """Public facade for taste analysis.

        Wraps the internal :meth:`_analyze_user_taste` helper.  Routers should
        call this public method; the underscore-prefixed helper remains
        available so existing callers keep working during the transition.
        """
        return self._analyze_user_taste(movies)
