"""Helper functions for API endpoints — movie parsing, rating normalization, etc."""

from fastapi import HTTPException

from config_manager import get_api_key as get_config_api_key
from models import MediaRating


# ── Genre name normalisation ──────────────────────────────────
# Maps variant names (Chinese translations, alternative spellings)
# to canonical English names, used by both the filters endpoint
# (for deduplication) and the media search (for cross-language matching).

NORMALIZE_GENRE: dict[str, str] = {
    # Chinese → English
    "动作": "Action",
    "冒险": "Adventure",
    "动画": "Animation",
    "喜剧": "Comedy",
    "犯罪": "Crime",
    "纪录片": "Documentary",
    "剧情": "Drama",
    "家庭": "Family",
    "奇幻": "Fantasy",
    "历史": "History",
    "恐怖": "Horror",
    "音乐": "Music",
    "悬疑": "Mystery",
    "爱情": "Romance",
    "科幻": "Sci-Fi",
    "电视电影": "TV Movie",
    "惊悚": "Thriller",
    "战争": "War",
    "西部": "Western",
    "动作冒险": "Action & Adventure",
    "儿童": "Kids",
    "新闻": "News",
    "真人秀": "Reality",
    "科幻奇幻": "Sci-Fi & Fantasy",
    "肥皂剧": "Soap",
    "脱口秀": "Talk",
    "战争政治": "War & Politics",
    # Variant English spellings → canonical
    "Science-Fiction": "Sci-Fi",
    "Science Fiction": "Sci-Fi",
}


def _build_reverse_genre_map() -> dict[str, list[str]]:
    """Build a reverse mapping from canonical (lowercased) → list of variant names.

    This is used by the media search to expand a genre filter so that
    selecting "Action" also matches items tagged with "动作".
    """
    result: dict[str, list[str]] = {}
    for variant, canonical in NORMALIZE_GENRE.items():
        key = canonical.lower()
        result.setdefault(key, []).append(variant)
    return result


REVERSE_GENRE_MAP: dict[str, list[str]] = _build_reverse_genre_map()


def get_api_key(model: str) -> str:
    """Get the configured API key for a given model type."""
    key_map = {"deepseek": "deepseek", "openai": "openai"}
    key_name = key_map.get(model)
    if not key_name:
        raise HTTPException(status_code=400, detail=f"Unsupported model: {model}")
    api_key = get_config_api_key(key_name)
    if not api_key:
        env_var = {"deepseek": "DEEPSEEK_API_KEY", "openai": "OPENAI_API_KEY"}[key_name]
        raise HTTPException(
            status_code=503,
            detail=f"{env_var} 未配置。请在设置页面或 .env 文件中配置。",
        )
    return api_key


def _normalize_ratings(movies: list[MediaRating]) -> list[MediaRating]:
    """Normalize ratings to a 0-10 scale.

    The frontend CSV parser normalises all ratings to 0-10 before
    sending them to the API, so by the time this function runs,
    ratings should already be on a 0-10 scale.  We just clamp and
    round to avoid floating-point artifacts.
    """
    if not movies:
        return movies
    return [
        MediaRating(
            title=m.title,
            rating=max(0.0, min(10.0, round(m.rating, 1))),
            year=m.year,
            genre=m.genre,
        )
        for m in movies
    ]


def parse_movie_data(raw_data) -> list[MediaRating]:
    """Parse raw input data into a list of MediaRating objects."""
    if isinstance(raw_data, list):
        items = raw_data
    elif isinstance(raw_data, dict):
        items = raw_data.get("items", raw_data.get("movies", []))
    else:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    if not isinstance(items, list) or not items:
        raise HTTPException(
            status_code=400,
            detail="No movie data found. Expected a list with 'title' and 'rating'/'user_rating' fields.",
        )
    movies = []
    for item in items:
        if not isinstance(item, dict):
            continue
        title = item.get("title") or item.get("name", "")
        if not title:
            continue
        try:
            rating = float(
                item.get(
                    "user_rating", item.get("rating", item.get("score", 0))
                )
            )
        except (ValueError, TypeError):
            rating = 5.0
        movies.append(
            MediaRating(
                title=title.strip(),
                rating=rating,
                year=item.get("year"),
                genre=item.get("genre"),
            )
        )
    if len(movies) < 1:
        raise HTTPException(
            status_code=400,
            detail=f"Please provide at least 1 movie (found {len(movies)})",
        )
    movies = _normalize_ratings(movies)
    return movies
