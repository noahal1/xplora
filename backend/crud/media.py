"""Media item CRUD operations (user-scoped)."""

from datetime import datetime, timezone
from typing import Optional, Any

from sqlalchemy import func as sa_func
from sqlmodel import Session, select, delete as sa_delete

from database import get_session
from models import MediaItemRecord, MediaRating, WishlistItem


# ── Helper: parse ISO datetime string ──────────────────────────────


def _parse_datetime(value: str | None) -> datetime | None:
    """Parse an ISO-format datetime string, returning None on failure."""
    if not value:
        return None
    try:
        # Handle both "2024-01-15" and "2024-01-15T10:30:00" formats
        if "T" not in value and len(value) == 10:
            value = value + "T00:00:00"
        if "+" not in value and not value.endswith("Z"):
            value += "Z"
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt
    except (ValueError, TypeError):
        return None


# ============================================
# Media items
# ============================================


def delete_all_media_for_user(user_id: int) -> int:
    """Delete all media records for a specific user. Returns count."""
    db = get_session()
    try:
        result = db.exec(
            sa_delete(MediaItemRecord).where(MediaItemRecord.user_id == user_id)
        )
        db.commit()
        return result.rowcount
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def db_delete_media_by_status(user_id: int, status: str) -> int:
    """Delete all media records for a user with a specific status. Returns count."""
    db = get_session()
    try:
        result = db.exec(
            sa_delete(MediaItemRecord).where(
                MediaItemRecord.user_id == user_id,
                MediaItemRecord.status == status,
            )
        )
        db.commit()
        return result.rowcount
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def save_media(
    items: list[MediaRating],
    user_id: int,
    status: str = "watched",
) -> list[MediaItemRecord]:
    """Persist a list of imported MediaRating objects for a user with the given status."""
    db = get_session()
    try:
        records: list[MediaItemRecord] = []
        now = datetime.now(timezone.utc)
        for m in items:
            record = MediaItemRecord(
                title=m.title,
                rating=m.rating,
                year=m.year,
                genre=m.genre,
                status=status,
                user_id=user_id,
                created_at=now,
            )
            db.add(record)
            records.append(record)
        db.commit()
        for r in records:
            db.refresh(r)
        return records
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def save_wishlist_items(
    items: list[WishlistItem],
    user_id: int,
) -> list[MediaItemRecord]:
    """Persist a list of wishlist items for a user."""
    db = get_session()
    try:
        records: list[MediaItemRecord] = []
        now = datetime.now(timezone.utc)
        for m in items:
            record = MediaItemRecord(
                title=m.title,
                rating=0.0,
                year=m.year,
                genre=m.genre,
                status="wish",
                user_id=user_id,
                created_at=now,
            )
            db.add(record)
            records.append(record)
        db.commit()
        for r in records:
            db.refresh(r)
        return records
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_media(
    user_id: int,
    search: str = "",
    page: int = 0,
    page_size: int = 50,
    status: Optional[str] = None,
    sort_field: str = "created_at",
    sort_dir: str = "desc",
    rating_min: Optional[float] = None,
    rating_max: Optional[float] = None,
    has_error: Optional[bool] = None,
    media_type: Optional[str] = None,
) -> tuple[list[MediaItemRecord], int]:
    """List saved media items for a user with optional search, status filter, rating range,
    scrape_error filter, media_type filter, pagination, and sort."""
    db = get_session()
    try:
        query = select(MediaItemRecord).where(MediaItemRecord.user_id == user_id)
        if status:
            query = query.where(MediaItemRecord.status == status)
        if media_type:
            query = query.where(MediaItemRecord.media_type == media_type)
        if search:
            # Escape SQL LIKE wildcards in user input
            escaped_search = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            query = query.where(MediaItemRecord.title.ilike(f"%{escaped_search}%", escape="\\"))
        if rating_min is not None:
            query = query.where(MediaItemRecord.rating >= rating_min)
        if rating_max is not None:
            query = query.where(MediaItemRecord.rating <= rating_max)
        if has_error:
            query = query.where(MediaItemRecord.scrape_error.isnot(None))

        total = db.scalar(
            select(sa_func.count()).select_from(query.subquery())
        ) or 0

        # Map sort_field to model attribute (prevent injection)
        allowed_fields = {
            "title": MediaItemRecord.title,
            "rating": MediaItemRecord.rating,
            "year": MediaItemRecord.year,
            "genre": MediaItemRecord.genre,
            "created_at": MediaItemRecord.created_at,
        }
        order_col = allowed_fields.get(sort_field, MediaItemRecord.created_at)
        order_fn = order_col.asc if sort_dir == "asc" else order_col.desc

        records = list(
            db.exec(
                query.order_by(order_fn())
                .offset(page * page_size)
                .limit(page_size)
            ).all()
        )
        return records, total
    finally:
        db.close()


def get_media_titles(user_id: int) -> list[str]:
    """Return just the titles of all media items for a user (lightweight, no pagination)."""
    db = get_session()
    try:
        results = db.exec(
            select(MediaItemRecord.title).where(MediaItemRecord.user_id == user_id)
        ).all()
        return list(results)
    finally:
        db.close()


def get_media_for_user(media_id: int, user_id: int) -> Optional[MediaItemRecord]:
    """Get a media item by ID, ensuring it belongs to the user."""
    db = get_session()
    try:
        return db.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.id == media_id, MediaItemRecord.user_id == user_id
            )
        ).first()
    finally:
        db.close()


def mark_media_as_watched(
    media_id: int,
    user_id: int,
    rating: float = 5.0,
) -> Optional[MediaItemRecord]:
    """Move a media item from wishlist to watched with a rating."""
    db = get_session()
    try:
        record = db.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.id == media_id,
                MediaItemRecord.user_id == user_id,
                MediaItemRecord.status == "wish",
            )
        ).first()
        if not record:
            return None
        record.status = "watched"
        record.rating = max(0.0, min(10.0, rating))
        db.commit()
        db.refresh(record)
        return record
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def update_media(
    media_id: int,
    user_id: int,
    title: Optional[str] = None,
    rating: Optional[float] = None,
    year: Optional[int] = None,
    genre: Optional[str] = None,
    status: Optional[str] = None,
    poster_url: Optional[str] = None,
    overview: Optional[str] = None,
    director: Optional[str] = None,
    actors: Optional[str] = None,
    runtime: Optional[int] = None,
    imdb_id: Optional[str] = None,
    tmdb_id: Optional[str] = None,
    country: Optional[str] = None,
    awards: Optional[str] = None,
    tagline: Optional[str] = None,
    tv_series_id: Optional[str] = None,
    season_number: Optional[int] = None,
    episode_count: Optional[int] = None,
    series_poster_url: Optional[str] = None,
    created_at: Optional[str] = None,
) -> Optional[MediaItemRecord]:
    """Update a media record. Returns updated record or None if not found."""
    db = get_session()
    try:
        record = db.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.id == media_id, MediaItemRecord.user_id == user_id
            )
        ).first()
        if not record:
            return None
        if title is not None:
            record.title = title
        if rating is not None:
            record.rating = max(0.0, min(10.0, rating))
        if year is not None:
            record.year = year
        if genre is not None:
            record.genre = genre
        if status is not None:
            record.status = status
        # === Metadata fields ===
        if poster_url is not None:
            record.poster_url = poster_url
        if overview is not None:
            record.overview = overview
        if director is not None:
            record.director = director
        if actors is not None:
            record.actors = actors
        if runtime is not None:
            record.runtime = runtime
        if imdb_id is not None:
            record.imdb_id = imdb_id
        if tmdb_id is not None:
            record.tmdb_id = tmdb_id
        if country is not None:
            record.country = country
        if awards is not None:
            record.awards = awards
        if tagline is not None:
            record.tagline = tagline
        # TV series-specific fields
        if tv_series_id is not None:
            record.tv_series_id = tv_series_id
        if season_number is not None:
            record.season_number = season_number
        if episode_count is not None:
            record.episode_count = episode_count
        if series_poster_url is not None:
            record.series_poster_url = series_poster_url
        if created_at is not None:
            parsed = _parse_datetime(created_at)
            if parsed:
                record.created_at = parsed
        db.commit()
        db.refresh(record)
        return record
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def batch_delete_media(media_ids: list[int], user_id: int) -> int:
    """Delete multiple media items by IDs (must all belong to user). Returns count."""
    db = get_session()
    try:
        result = db.exec(
            sa_delete(MediaItemRecord).where(
                MediaItemRecord.id.in_(media_ids),
                MediaItemRecord.user_id == user_id,
            )
        )
        db.commit()
        return result.rowcount
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def enrich_media_metadata(
    media_id: int,
    user_id: int,
    metadata: dict[str, Any],
) -> Optional[MediaItemRecord]:
    """Update a media record with scraped metadata fields.
    Only updates fields that are present in the metadata dict.
    """
    db = get_session()
    try:
        record = db.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.id == media_id, MediaItemRecord.user_id == user_id
            )
        ).first()
        if not record:
            return None

        # Map metadata fields to model attributes.
        # NOTE: title is intentionally excluded — it comes from the
        # user's import and must not be overwritten by TMDB/OMDb data
        # (which may differ in language or formatting).
        # Genre IS included because many imports lack genre info,
        # and TMDB data is a reliable source for it.
        field_map = {
            "poster_url": "poster_url",
            "overview": "overview",
            "director": "director",
            "actors": "actors",
            "runtime": "runtime",
            "imdb_id": "imdb_id",
            "tmdb_id": "tmdb_id",
            "country": "country",
            "awards": "awards",
            "tagline": "tagline",
            "media_type": "media_type",
            "genre": "genre",
            # TV series-specific fields
            "tv_series_id": "tv_series_id",
            "season_number": "season_number",
            "season_episode_count": "episode_count",
            "series_poster_url": "series_poster_url",
        }
        for key, attr in field_map.items():
            if key in metadata and metadata[key] is not None:
                setattr(record, attr, metadata[key])

        # Update year from scraped data ONLY for movies (not TV series,
        # where the year is the series' first air date and may not match
        # the specific season the user imported).
        if metadata.get("media_type") != "tv" and "year" in metadata and metadata["year"] is not None:
            record.year = metadata["year"]

        db.commit()
        db.refresh(record)
        return record
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def set_scrape_error(media_id: int, user_id: int, error: str):
    """Record a scrape error message for a media item."""
    db = get_session()
    try:
        record = db.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.id == media_id, MediaItemRecord.user_id == user_id
            )
        ).first()
        if record:
            record.scrape_error = error
            db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def clear_scrape_error(media_id: int, user_id: int):
    """Clear the scrape error for a media item (on successful scrape)."""
    db = get_session()
    try:
        record = db.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.id == media_id, MediaItemRecord.user_id == user_id
            )
        ).first()
        if record:
            record.scrape_error = None
            db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_unenriched_media_ids(user_id: int) -> list[int]:
    """Return IDs of all media items for a user that don't have poster_url yet."""
    db = get_session()
    try:
        records = db.exec(
            select(MediaItemRecord.id).where(
                MediaItemRecord.user_id == user_id,
                MediaItemRecord.poster_url.is_(None),
            )
        ).all()
        return list(records)
    finally:
        db.close()


def get_external_poster_media_ids(user_id: int) -> list[tuple[int, str, str | None]]:
    """Return (id, poster_url, tmdb_id) for media items whose poster_url points
    to an external CDN (i.e. not a local ``/static/`` path).

    These are items that were scraped before local poster caching was
    introduced — they have valid poster URLs from TMDB but the image
    hasn't been downloaded to the local filesystem yet.
    """
    db = get_session()
    try:
        records = db.exec(
            select(MediaItemRecord.id, MediaItemRecord.poster_url, MediaItemRecord.tmdb_id).where(
                MediaItemRecord.user_id == user_id,
                MediaItemRecord.poster_url.isnot(None),
                MediaItemRecord.poster_url.not_like("/static/%"),
            )
        ).all()
        return [
            (r.id, r.poster_url, r.tmdb_id)
            for r in records
            if r.poster_url  # safety: should always be truthy here
        ]
    finally:
        db.close()


def get_enrich_progress(user_id: int) -> tuple[int, int, int]:
    """Count total, processed, and failed items for enrichment progress.

    "Processed" means the item either has a poster_url (success)
    or has a scrape_error (failure — TMDB couldn't find it, etc.).
    "Failed" means scrape_error is set but poster_url is still NULL
    (i.e. processed but unsuccessful).

    Returns (total, processed, failed).
    """
    db = get_session()
    try:
        total = db.scalar(
            select(sa_func.count()).select_from(
                select(MediaItemRecord).where(MediaItemRecord.user_id == user_id).subquery()
            )
        ) or 0
        processed = db.scalar(
            select(sa_func.count()).select_from(
                select(MediaItemRecord).where(
                    MediaItemRecord.user_id == user_id,
                    sa_func.coalesce(MediaItemRecord.poster_url, MediaItemRecord.scrape_error).isnot(None),
                ).subquery()
            )
        ) or 0
        failed = db.scalar(
            select(sa_func.count()).select_from(
                select(MediaItemRecord).where(
                    MediaItemRecord.user_id == user_id,
                    MediaItemRecord.poster_url.is_(None),
                    MediaItemRecord.scrape_error.isnot(None),
                ).subquery()
            )
        ) or 0
        return total, processed, failed
    finally:
        db.close()


def delete_media(media_id: int, user_id: int) -> bool:
    """Delete a media item by ID (must belong to user)."""
    db = get_session()
    try:
        record = db.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.id == media_id, MediaItemRecord.user_id == user_id
            )
        ).first()
        if not record:
            return False
        db.delete(record)
        db.commit()
        return True
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
