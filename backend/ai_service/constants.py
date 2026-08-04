"""Shared constants, caches, and helpers for the AI service package."""

import logging

from models import MediaRecommendation


# Model configuration
MODEL_CONFIGS = {
    "deepseek": {
        "api_base": "https://api.deepseek.com",
        "model": "deepseek-v4-flash",
        "env_key": "DEEPSEEK_API_KEY",
    },
    "openai": {
        "api_base": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "env_key": "OPENAI_API_KEY",
    },
}

# Per-strategy temperature configuration
# Lower = more deterministic/focused, Higher = more creative/diverse
STRATEGY_TEMPERATURES = {
    "taste": 0.5,      # Precise matching to user's taste
    "classics": 0.6,   # Balanced for canonical picks
    "mood": 0.7,       # Moderate creativity for mood matching
    "era": 0.6,        # Focused on time period
    "gems": 0.8,       # More creative for hidden finds
    "explore": 0.9,    # Most creative for new genres
}

DEFAULT_TEMPERATURE = 0.7
MAX_TOKENS = 3000  # Increased from 2000 for Chinese responses
MAX_API_RETRIES = 10  # Hard cap on total retries per request to prevent excessive API calls

# ── System prompts ──────────────────────────────────────────────
# The exact JSON output schema is embedded in each system prompt so
# json_object mode reliably follows the shape (the schema must appear in
# the prompt, and system-prompt placement is more robust than user-only).

RECOMMEND_JSON_SCHEMA = (
    '{"recommendations": [{"title": "...", "year": 2024, '
    '"genre": "Sci-Fi / Action", "reason": "...", "confidence": 0.85}]}'
)

SYSTEM_PROMPT_RECOMMEND = (
    "You are a professional movie recommendation expert who analyzes user taste "
    "and recommends suitable movies. Always respond with valid JSON only, "
    "without markdown formatting or code blocks, in exactly this format:\n"
    + RECOMMEND_JSON_SCHEMA
)
SYSTEM_PROMPT_FOLLOWUP = (
    "You are a professional movie recommendation expert helping a user understand "
    "their recommendations. Always respond with valid JSON only, without markdown "
    "formatting or code blocks, in one of these two formats:\n"
    '1. {"type": "recommendations", "message": "...", "recommendations": '
    '[{"title": "...", "year": 2024, "genre": "...", "reason": "...", "confidence": 0.85}]}\n'
    '2. {"type": "text", "message": "..."}'
)
SYSTEM_PROMPT_TMDB = (
    "You are a professional movie recommendation expert. Select from the provided "
    "candidate list only. Always respond with valid JSON only, without markdown "
    "formatting or code blocks, in exactly this format:\n"
    + RECOMMEND_JSON_SCHEMA
)

# Playlist system prompt factory — the output schema differs per call
# (name generation vs categorization vs completion plan), so each call
# site builds its system prompt with the exact schema for that call.
def build_playlist_system_prompt(schema: str) -> str:
    """Build the playlist system prompt with the exact JSON output schema."""
    return (
        "You are a playlist curation expert. Always respond with valid JSON only, "
        "without markdown formatting or code blocks, matching this exact schema:\n"
        + schema
    )

PLAYLIST_JSON_SCHEMA_NAMES = (
    '{"names": ["...", "..."], "people": [{"name": "...", "role": "director", '
    '"playlist_name": "..."}]}'
)
PLAYLIST_JSON_SCHEMA_CATEGORIZE = (
    '{"suggestions": [{"playlist_id": 1, "reason": "...", "confidence": 0.9}]}'
)
PLAYLIST_JSON_SCHEMA_COMPLETE = (
    '{"suggestions": [{"title": "...", "year": 2024, "genre": "...", '
    '"reason": "...", "confidence": 0.9}]}'
)

# Strategies where TMDB candidate pool should NOT be used
# These strategies have fundamentally different goals from TMDB's
# "similar/recommendations" algorithm and would produce poor results.
TMDB_SKIP_STRATEGIES = {
    "explore",  # TMDB finds SIMILAR movies; explore needs DIFFERENT genres
    "era",      # TMDB candidates are limited to the user's movie eras
}

# ── TMDB candidate cache ───────────────────────────────────────────
# Caches the result of _build_tmdb_candidates() keyed by
# (sorted user_tmdb_ids, sorted excluded_tmdb_ids).  Avoids
# redundant TMDB API calls when the user requests recommendations
# multiple times within a short window (e.g. trying different
# strategies/strategies).
#
# Cache is invalidated whenever the user adds/rates new movies
# (because user_tmdb_ids or excluded_tmdb_ids change).

_tmdb_candidate_cache: dict[str, tuple[float, list[dict]]] = {}
TMDB_CACHE_TTL = 3600  # 1 hour


def _tmdb_cache_key(user_id: int, user_tmdb_ids: list[tuple[str, str]], excluded_tmdb_ids: set[str] | None) -> str:
    """Build a deterministic cache key from source (TMDB ID, media_type) pairs.

    Includes ``user_id`` to prevent cross-user cache collisions when two users
    happen to have the same TMDB IDs in their library.
    """
    ids_part = tuple(sorted(user_tmdb_ids))
    excluded_part = tuple(sorted(excluded_tmdb_ids)) if excluded_tmdb_ids else ()
    return str(hash((user_id, ids_part, excluded_part)))


# ── Taste analysis cache ───────────────────────────────────────────
# Caches the result of _analyze_user_taste() keyed by a hash of the
# movies list.  Avoids redundant CPU work when the same user re-runs
# recommendations with the same movie data (e.g. trying different
# strategies in quick succession).

_taste_cache: dict[str, tuple[float, dict]] = {}
TASTE_CACHE_TTL = 3600  # 1 hour


def _taste_cache_key(user_id: int, movies: list["MediaRating"]) -> str:
    """Build a deterministic cache key from a list of MediaRating objects.

    Includes ``user_id`` to prevent cross-user cache collisions when two users
    happen to have the exact same movie list.
    """
    items = []
    for m in movies:
        items.append((m.title or "", m.rating or 0, m.year, m.genre or ""))
    items.sort(key=lambda x: (x[0], x[1]))
    return str(hash((user_id, tuple(items))))


logger = logging.getLogger(__name__)


# ── Helpers ─────────────────────────────────────────────────────────


def _get_title(r) -> str:
    """Get the title from a MediaRecommendation object or dict."""
    return r.title if isinstance(r, MediaRecommendation) else r.get("title", "")


def _get_filtered_out(before: list, after: list) -> list:
    """Get items that were in ``before`` but removed in ``after``.

    Works with both ``MediaRecommendation`` objects and dicts.
    """
    after_titles = {_get_title(r) for r in after}
    return [r for r in before if _get_title(r) not in after_titles]
