"""Re-download missing poster files for all users.

Scans the database for media items with ``/static/posters/`` URLs, checks if
the file exists on disk, and re-fetches from TMDB if missing.

Uses the TMDB API to get the correct poster_path (hash-based), since the
original CDN URL was overwritten when the local path was stored.
"""

import logging
import os
import sys

from config_manager import get_api_key as get_config_api_key
from database import get_session
from httpx import Timeout
from http_client import get_shared_client
from models import MediaItemRecord
from movie_search import TMDB_IMAGE_BASE
from poster_cache import download_and_cache_poster, ensure_poster_dir
from sqlmodel import select

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)
TMDB_BASE = "https://api.tmdb.org/3"


def _fetch_poster_url(tmdb_id: str, media_type: str) -> str | None:
    """Fetch poster_path from TMDB for a given movie/TV ID and return
    the full CDN URL, or ``None`` on failure.
    """
    api_key = get_config_api_key("tmdb")
    if not api_key:
        logger.warning("TMDB key not configured — cannot re-fetch poster URLs")
        return None

    endpoint = "tv" if media_type == "tv" else "movie"
    url = f"{TMDB_BASE}/{endpoint}/{tmdb_id}"
    params = {"api_key": api_key, "language": "zh-CN"}

    try:
        client = get_shared_client()
        resp = client.get(url, params=params, timeout=Timeout(10.0, connect=15.0))
        resp.raise_for_status()
        data = resp.json()
        poster_path = data.get("poster_path")
        if poster_path:
            return f"{TMDB_IMAGE_BASE}{poster_path}"
    except Exception as e:
        logger.warning("Failed to fetch TMDB %s ID %s: %s", endpoint, tmdb_id, e)

    return None


def recache_missing_posters() -> tuple[int, int, int]:
    """Find all media items with local poster URLs whose files are missing
    and re-download them from TMDB.

    Returns (total_checked, already_exist, re_cached).
    """
    ensure_poster_dir()
    db = get_session()
    try:
        records = db.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.poster_url.isnot(None),
                MediaItemRecord.poster_url.like("/static/%"),
            )
        ).all()
    finally:
        db.close()

    total = len(records)
    exists = 0
    recached = 0

    for r in records:
        poster_url = r.poster_url or ""
        filename = poster_url.replace("/static/posters/", "")
        local_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "static", "posters", filename
        )

        if os.path.isfile(local_path):
            exists += 1
            continue  # File exists, skip

        logger.info("Missing: %s (media_id=%d, title=%s)", filename, r.id, r.title)

        # Fetch the poster URL from TMDB using stored tmdb_id
        # Filename formats:
        #   Old: "tmdb_550.jpg"
        #   New: "tmdb_550_abc12345.jpg"  (with URL hash suffix)
        # Extract the TMDB ID (second part between underscores)
        if r.tmdb_id:
            tmdb_id = r.tmdb_id
        else:
            parts = filename.replace(".jpg", "").split("_")
            tmdb_id = parts[1] if len(parts) >= 2 else parts[0]
        media_type = getattr(r, "media_type", "movie") or "movie"
        cdn_url = _fetch_poster_url(tmdb_id, media_type)

        if cdn_url:
            local_url = download_and_cache_poster(cdn_url, tmdb_id=tmdb_id)
            if local_url:
                recached += 1
                logger.info("  Re-cached: %s", local_url)
            else:
                logger.warning("  download_and_cache_poster failed for %s", cdn_url)
        else:
            logger.warning("  Could not get poster URL from TMDB for media_id=%d", r.id)

    return total, exists, recached


if __name__ == "__main__":
    total, exists, recached = recache_missing_posters()
    print(f"\nChecked {total} media items with local poster URLs.")
    print(f"  Already on disk: {exists}")
    print(f"  Re-cached: {recached}")
    if total == 0:
        print("No media items with local poster URLs found.")
    sys.exit(0)
