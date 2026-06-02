"""Poster image download and local caching.

Downloads poster images from TMDB CDN and caches them to the local
filesystem so the application can serve them directly, avoiding
reliance on external CDN availability (especially useful behind
firewalls where TMDB may be slow or blocked).

Key design principles:
  - Download failure is non-fatal: the original TMDB CDN URL is kept,
    so behavior is no worse than before.
  - The storage directory is configurable via the ``POSTER_STORAGE_DIR``
    environment variable (default: ``backend/static/posters/``).
  - Docker-friendly: mount a named volume at the storage directory.
"""

import hashlib
import logging
import os

import httpx

logger = logging.getLogger(__name__)

# Default storage path: backend/static/posters/ relative to this file
_DEFAULT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "static", "posters"
)

POSTER_DIR = os.environ.get("POSTER_STORAGE_DIR", _DEFAULT_DIR)

# How long to wait when downloading a poster from TMDB CDN
_DOWNLOAD_TIMEOUT = 15  # seconds


def ensure_poster_dir() -> str:
    """Create the poster storage directory if it doesn't exist.

    Returns the absolute path to the directory.
    Safe to call multiple times (idempotent).
    """
    os.makedirs(POSTER_DIR, exist_ok=True)
    return POSTER_DIR


def get_poster_dir() -> str:
    """Return the absolute path to the poster storage directory."""
    return POSTER_DIR


def _generate_filename(poster_url: str, tmdb_id: str | None = None) -> str:
    """Generate a deterministic filename for a poster image.

    Uses the TMDB ID when available (preferred), otherwise falls back
    to an MD5 hash of the poster URL.
    """
    if tmdb_id:
        return f"tmdb_{tmdb_id}.jpg"
    # Hash the URL to get a stable filename
    url_hash = hashlib.md5(poster_url.encode()).hexdigest()
    return f"url_{url_hash}.jpg"


def download_and_cache_poster(
    poster_url: str,
    tmdb_id: str | None = None,
) -> str | None:
    """Download a poster image from TMDB CDN and save it locally.

    Args:
        poster_url: The full TMDB CDN URL (e.g. ``https://image.tmdb.org/...``).
        tmdb_id: Optional TMDB movie ID for a human-readable filename.

    Returns:
        The local URL path (e.g. ``/static/posters/tmdb_550.jpg``) on
        success, or ``None`` if the download failed for any reason.
    """
    if not poster_url or not poster_url.startswith("http"):
        return None

    filename = _generate_filename(poster_url, tmdb_id)
    local_path = os.path.join(POSTER_DIR, filename)

    # Already cached — return local URL immediately
    if os.path.isfile(local_path):
        return f"/static/posters/{filename}"

    # Ensure the directory exists
    ensure_poster_dir()

    try:
        with httpx.Client(timeout=_DOWNLOAD_TIMEOUT, follow_redirects=True) as client:
            resp = client.get(poster_url)
            resp.raise_for_status()

        with open(local_path, "wb") as f:
            f.write(resp.content)

        logger.info(
            "Cached poster: %s -> %s (%.1f KB)",
            poster_url, filename, len(resp.content) / 1024,
        )
        return f"/static/posters/{filename}"

    except Exception as exc:
        logger.warning(
            "Failed to download poster %s: %s", poster_url, exc,
        )
        return None
