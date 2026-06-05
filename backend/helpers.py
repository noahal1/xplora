"""Helper functions for API endpoints — movie parsing, rating normalization, etc."""

from fastapi import HTTPException

from config_manager import get_api_key as get_config_api_key
from models import MediaRating


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
    """Normalize ratings to a 0-10 scale."""
    if not movies:
        return movies
    max_rating = max(m.rating for m in movies)
    if max_rating <= 5:
        return [
            MediaRating(
                title=m.title,
                rating=round(m.rating * 2, 1),
                year=m.year,
                genre=m.genre,
            )
            for m in movies
        ]
    return [
        MediaRating(
            title=m.title,
            rating=max(0.0, min(10.0, m.rating)),
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
