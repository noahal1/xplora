"""TMDB genre ID to name mapping."""

from .constants import _TMDB_GENRE_MAP, _TMDB_TV_GENRE_MAP

def _map_tmdb_genres(genre_ids: list[int]) -> str:
    """Map TMDB genre IDs to human-readable genre names."""
    names = []
    for gid in genre_ids:
        name = _TMDB_GENRE_MAP.get(gid)
        if name:
            names.append(name)
    return " / ".join(names) if names else ""


def _map_tmdb_tv_genres(genre_ids: list[int]) -> str:
    """Map TMDB TV genre IDs to human-readable genre names."""
    names = []
    for gid in genre_ids:
        name = _TMDB_TV_GENRE_MAP.get(gid)
        if name:
            names.append(name)
    return " / ".join(names) if names else ""


