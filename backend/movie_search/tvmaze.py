"""TVmaze search and detail API calls."""

import logging
import re
from typing import Optional

from httpx import Timeout
from http_client import get_shared_client

from .constants import TVMAZE_BASE
from .models import MovieSearchResult

logger = logging.getLogger(__name__)

def search_tvmaze(query: str) -> list[MovieSearchResult]:
    url = f"{TVMAZE_BASE}/search/shows"
    params = {"q": query}
    try:
        client = get_shared_client()
        resp = client.get(url, params=params, timeout=Timeout(5.0, connect=15.0))
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"TVmaze search failed: {e}")

    results: list[MovieSearchResult] = []
    for item in data:
        show = item.get("show", {})
        name = show.get("name") or ""
        if not name:
            continue
        premiered = show.get("premiered", "")
        year = int(premiered[:4]) if premiered and len(premiered) >= 4 else None
        genres = show.get("genres", [])
        genre_str = " / ".join(genres) if genres else ""
        image = show.get("image") or {}
        poster_url = image.get("medium") or None
        # Strip HTML tags from summary for a clean preview
        summary = show.get("summary", "") or ""
        if summary:
            summary = _strip_html(summary)

        results.append(MovieSearchResult(
            title=name,
            year=year,
            genre=genre_str,
            poster_url=poster_url,
            source_id=str(show.get("id", "")),
            source="tvmaze",
            original_title=show.get("name", ""),
            media_type="tv",
        ))
    return results


def _strip_html(text: str) -> str:
    """Remove HTML tags from a string and strip whitespace."""
    return re.sub(r"<[^>]+>", "", text).strip()


def _get_tvmaze_detail(show_id: str, season_number: Optional[int] = None) -> dict:
    """Fetch full TV series details from TVmaze by show ID.

    TVmaze is free and requires no API key. The response includes
    rich metadata: name, status, network, genres, summary, image,
    external IDs (IMDb, TheTVDB), and more.

    Uses ``?embed=episodes`` to get the episode list, which is
    counted to populate ``season_episode_count``.

    If ``season_number`` is provided, only episodes from that
    season are counted — so the episode count accurately reflects
    a specific season's number of episodes rather than the total
    series episode count.
    """
    url = f"{TVMAZE_BASE}/shows/{show_id}"
    params = {"embed": "episodes"}
    try:
        client = get_shared_client()
        resp = client.get(url, params=params, timeout=Timeout(5.0, connect=15.0))
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"TVmaze detail fetch failed: {e}")

    premiered = data.get("premiered", "")
    year = int(premiered[:4]) if premiered and len(premiered) >= 4 else None
    image = data.get("image") or {}
    poster_url = image.get("original") or image.get("medium") or None
    genres = data.get("genres", [])
    genre_str = " / ".join(genres) if genres else ""
    summary = data.get("summary", "") or ""
    if summary:
        summary = _strip_html(summary)
    network = data.get("network") or {}
    network_name = network.get("name", "") if network else ""
    web_channel = data.get("webChannel") or {}
    web_channel_name = web_channel.get("name", "") if web_channel else ""
    channel = network_name or web_channel_name
    externals = data.get("externals", {}) or {}
    imdb_id = externals.get("imdb", "") or ""
    thetvdb_id = externals.get("thetvdb", "") or ""

    # Build a runtime-like field: average episode runtime
    avg_runtime = data.get("averageRuntime") or data.get("runtime") or None

    # ── Episode count: filter by season if season_number is known ──
    embedded = data.get("_embedded") or {}
    episodes_list = embedded.get("episodes") or []
    if season_number is not None:
        # TVmaze episodes have a ``season`` field — filter to match
        season_episodes = [
            ep for ep in episodes_list
            if ep.get("season") == season_number
        ]
        episode_count = len(season_episodes) if season_episodes else None
    else:
        episode_count = len(episodes_list) if episodes_list else None

    # TVmaze has no native tv_series_id; use the same show_id so that
    # all seasons of the same show share a common grouping key.
    tv_series_id = show_id

    result = {
        "title": data.get("name", ""),
        "year": year,
        "genre": genre_str,
        "poster_url": poster_url,
        "overview": summary,
        "rating": data.get("rating", {}).get("average") if data.get("rating") else None,
        "vote_count": None,
        "runtime": avg_runtime,
        "tagline": "",
        "homepage": data.get("url", ""),
        "original_language": data.get("language", ""),
        "source": "tvmaze",
        "source_id": show_id,
        "tv_series_id": tv_series_id,
        "media_type": "tv",
        "writer": "",
        "country": network.get("country", {}).get("name", "") if network else "",
        "status": data.get("status", ""),
        "network": channel,
        "imdb_id": imdb_id if imdb_id.startswith("tt") else None,
        "thetvdb_id": str(thetvdb_id) if thetvdb_id else None,
        "season_episode_count": episode_count,
        "seasons": None,
        "episodes": None,
    }

    # Also set season_number in the result so enrich_media_metadata can
    # save it to the database — consistent with TMDB TV path.
    if season_number is not None:
        result["season_number"] = season_number

    return result


