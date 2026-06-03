"""Scraper package.

Re-exports the async wrappers needed by routers.
"""

from scraper.background import async_background_enrich_movies, async_background_cache_posters

__all__ = [
    "async_background_enrich_movies",
    "async_background_cache_posters",
]
