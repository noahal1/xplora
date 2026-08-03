"""Movie search service — proxies requests to TMDB and TVmaze APIs."""

from .constants import TMDB_IMAGE_BASE
from .detail import get_movie_detail
from .models import MovieSearchResult
from .search import extract_year, search_movies
from .tmdb import (
    get_tmdb_movie_recommendations,
    get_tmdb_movie_similar,
    get_tmdb_tv_recommendations,
    get_tmdb_tv_similar,
    search_tmdb,
    search_tmdb_dual,
    search_tmdb_tv,
    search_tmdb_tv_dual,
)
from .tvmaze import search_tvmaze

__all__ = [
    "MovieSearchResult",
    "TMDB_IMAGE_BASE",
    "extract_year",
    "get_movie_detail",
    "get_tmdb_movie_recommendations",
    "get_tmdb_movie_similar",
    "get_tmdb_tv_recommendations",
    "get_tmdb_tv_similar",
    "search_movies",
    "search_tmdb",
    "search_tmdb_dual",
    "search_tmdb_tv",
    "search_tmdb_tv_dual",
    "search_tvmaze",
]
