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

from httpx import Timeout
from http_client import get_shared_client

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


def local_poster_file_exists(poster_url: str) -> bool:
    """Check if a local poster file exists on disk for a given ``/static/`` poster URL.

    Returns ``True`` if:
    - The URL is not a local path (can't check — assume exists)
    - The file actually exists on disk

    Returns ``False`` if the URL starts with ``/static/`` but the
    corresponding file is missing from the filesystem.

    This is used to detect poster files that were lost (e.g. deleted
    manually, Docker volume reset) so they can be re-downloaded.
    """
    if not poster_url or not poster_url.startswith("/static/"):
        return True  # not a local path — can't verify; assume ok
    filename = poster_url.replace("/static/posters/", "")
    local_path = os.path.join(POSTER_DIR, filename)
    return os.path.isfile(local_path)


def _generate_filename(poster_url: str, tmdb_id: str | None = None) -> str:
    """Generate a deterministic filename for a poster image.

    Uses the TMDB ID when available (preferred) combined with an 8-char
    MD5 hash of the poster URL. The URL hash disambiguates between:
    - Different seasons of the same TV series (different poster URLs)
    - Movies and TV shows that happen to share the same numeric TMDB ID
      (TMDB movie/TV IDs are independent namespaces)

    Without the hash, ``tmdb_550.jpg`` could be overwritten by S2→S3 of
    the same show, or by a movie that happens to have ID 550.

    Falls back to a full MD5 hash of the poster URL if no TMDB ID is
    available.
    """
    if tmdb_id:
        url_hash = hashlib.md5(poster_url.encode()).hexdigest()[:8]
        return f"tmdb_{tmdb_id}_{url_hash}.jpg"
    # Hash the URL to get a stable filename
    url_hash = hashlib.md5(poster_url.encode()).hexdigest()
    return f"url_{url_hash}.jpg"


_MIN_IMAGE_SIZE = 1024  # 1 KB — real poster images are always larger

# Magic bytes for common image formats
_IMAGE_MAGIC: list[tuple[bytes, str]] = [
    (b"\xff\xd8\xff", "JPEG"),
    (b"\x89PNG\r\n\x1a\n", "PNG"),
    (b"GIF87a", "GIF"),
    (b"GIF89a", "GIF"),
]


def _is_webp(head: bytes) -> bool:
    """Check if the first 12 bytes match WebP (RIFF + 4-byte size + WEBP)."""
    return len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP"


def _validate_image_content(
    content: bytes,
    content_type: str | None,
    url: str,
) -> bool:
    """Validate downloaded content is a real image.

    Checks:
    1. ``Content-Type`` header starts with ``image/``
    2. Content size > minimum threshold (1 KB)
    3. Magic bytes match a known image format (JPEG, PNG, GIF, WebP)

    Returns ``True`` if valid, ``False`` otherwise (with a warning log).
    """
    # Check Content-Type
    if content_type is None:
        logger.info(
            "Poster %s has no Content-Type header (%d bytes) — checking magic bytes only",
            url, len(content),
        )
    elif not content_type.startswith("image/"):
        logger.warning(
            "Poster %s has non-image Content-Type '%s' (%d bytes) — rejecting",
            url, content_type, len(content),
        )
        return False

    # Check minimum size
    if len(content) < _MIN_IMAGE_SIZE:
        logger.warning(
            "Poster %s too small: %d bytes (min %d) — rejecting",
            url, len(content), _MIN_IMAGE_SIZE,
        )
        return False

    # Check magic bytes — only check up to 12 bytes (covers all formats)
    head = content[:12]
    for magic, fmt in _IMAGE_MAGIC:
        if head[:len(magic)] == magic:
            return True
    if _is_webp(head):
        return True

    logger.warning(
        "Poster %s unknown format — expected one of JPEG/PNG/GIF/WebP (first 16 bytes: %s, %d bytes) — rejecting",
        url, content[:16].hex(), len(content),
    )
    return False


def download_and_cache_poster(
    poster_url: str,
    tmdb_id: str | None = None,
) -> str | None:
    """Download a poster image from TMDB CDN and save it locally.

    Validates the response is a real image (checks ``Content-Type``,
    minimum size, and magic bytes) before writing to disk, preventing
    corrupted/hijacked payloads (e.g., firewall HTML pages) from being
    permanently cached.

    Args:
        poster_url: The full TMDB CDN URL (e.g. ``https://image.tmdb.org/...``).
        tmdb_id: Optional TMDB movie ID for a human-readable filename.

    Returns:
        The local URL path (e.g. ``/static/posters/tmdb_550_hash.jpg``) on
        success, or ``None`` if the download or validation failed.
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
        client = get_shared_client()
        resp = client.get(poster_url, timeout=Timeout(_DOWNLOAD_TIMEOUT, connect=15.0))
        resp.raise_for_status()

        content = resp.content
        content_type = resp.headers.get("content-type")

        # Validate the downloaded content is a real image before writing
        if not _validate_image_content(content, content_type, poster_url):
            return None

        with open(local_path, "wb") as f:
            f.write(content)

        logger.info(
            "Cached poster: %s -> %s (%s, %.1f KB)",
            poster_url, filename,
            content_type or "unknown",
            len(content) / 1024,
        )
        return f"/static/posters/{filename}"

    except Exception as exc:
        logger.warning(
            "Failed to download poster %s: %s", poster_url, exc,
        )
        return None
