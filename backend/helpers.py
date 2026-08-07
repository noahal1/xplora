"""Helper functions for API endpoints — movie parsing, rating normalization, etc."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

from config_manager import get_api_key as get_config_api_key
from models import MediaRating


# ── Timestamp serialization ─────────────────────────────────────
# SQLite stores datetimes without timezone info, so values read back
# from the DB are naive — but they were always written as UTC. If we
# serialized them directly, clients would misinterpret them (JS treats
# timezone-less ISO strings as LOCAL time, shifting every displayed
# timestamp by the local offset). This helper re-attaches the UTC
# offset so every API response is self-describing.


def iso_utc(dt: Optional[datetime], empty: Optional[str] = "") -> Optional[str]:
    """Serialize a datetime as ISO 8601 with an explicit UTC offset.

    Naive datetimes (read from SQLite) are assumed to be UTC and get
    ``+00:00`` appended; ``None`` returns ``empty`` (default ``""``).
    """
    if dt is None:
        return empty
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


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
    "纪录": "Documentary",
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

# ── Country name normalisation ────────────────────────────────
# Maps Chinese country names to canonical English ISO names.

NORMALIZE_COUNTRY: dict[str, str] = {
    # English name variants → canonical
    "United States of America": "United States",
    "USA": "United States",
    "United Kingdom": "United Kingdom",
    "UK": "United Kingdom",
    "Great Britain": "United Kingdom",
    "Korea, Republic of": "South Korea",
    "Russian Federation": "Russia",
    "Iran, Islamic Republic of": "Iran",
    "Taiwan, Province of China": "Taiwan",
    "Czechia": "Czech Republic",
    "UAE": "United Arab Emirates",
    # Chinese → English
    "美国": "United States",
    "中国": "China",
    "中国大陆": "China",
    "日本": "Japan",
    "英国": "United Kingdom",
    "法国": "France",
    "德国": "Germany",
    "韩国": "South Korea",
    "南韩": "South Korea",
    "意大利": "Italy",
    "西班牙": "Spain",
    "俄罗斯": "Russia",
    "加拿大": "Canada",
    "澳大利亚": "Australia",
    "印度": "India",
    "巴西": "Brazil",
    "荷兰": "Netherlands",
    "瑞典": "Sweden",
    "挪威": "Norway",
    "丹麦": "Denmark",
    "芬兰": "Finland",
    "比利时": "Belgium",
    "瑞士": "Switzerland",
    "奥地利": "Austria",
    "波兰": "Poland",
    "土耳其": "Turkey",
    "墨西哥": "Mexico",
    "阿根廷": "Argentina",
    "新西兰": "New Zealand",
    "泰国": "Thailand",
    "香港": "Hong Kong",
    "台湾": "Taiwan",
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
    """Get the configured API key for a given model type.

    Supports every entry in ``ai_service.constants.MODEL_CONFIGS``.
    Key-less local models (e.g. Ollama) return a placeholder so they
    always work; configured-key models raise 503 when not configured.
    """
    from ai_service.constants import MODEL_CONFIGS

    config = MODEL_CONFIGS.get(model)
    if not config:
        raise HTTPException(status_code=400, detail=f"Unsupported model: {model}")
    if config.get("requires_key") is False:
        return config.get("placeholder_key", "ollama")
    api_key = get_config_api_key(model)
    if not api_key:
        env_var = config.get("env_key", model.upper())
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
            media_type=m.media_type,
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
                media_type=item.get("media_type", "movie"),
            )
        )
    if len(movies) < 1:
        raise HTTPException(
            status_code=400,
            detail=f"Please provide at least 1 movie (found {len(movies)})",
        )
    movies = _normalize_ratings(movies)
    return movies
