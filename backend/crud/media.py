"""Media item CRUD operations (user-scoped)."""

from collections import Counter
from datetime import datetime, timezone
from typing import Optional, Any

from sqlalchemy import func as sa_func
from sqlmodel import Session, select, delete as sa_delete

from database import get_session
from models import MediaItemRecord, MediaRating, WishlistItem


# ── Helper: resolve session ────────────────────────────────────

def _resolve_db(db: Optional[Session] = None) -> tuple[Session, bool]:
    """Return a session and whether it needs to be closed."""
    if db is not None:
        return db, False
    return get_session(), True


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


def delete_all_media_for_user(user_id: int, db: Optional[Session] = None) -> int:
    """Delete all media records for a specific user. Returns count."""
    session, close_db = _resolve_db(db)
    try:
        result = session.exec(
            sa_delete(MediaItemRecord).where(MediaItemRecord.user_id == user_id)
        )
        session.commit()
        return result.rowcount
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()


def db_delete_media_by_status(user_id: int, status: str, db: Optional[Session] = None) -> int:
    """Delete all media records for a user with a specific status. Returns count."""
    session, close_db = _resolve_db(db)
    try:
        result = session.exec(
            sa_delete(MediaItemRecord).where(
                MediaItemRecord.user_id == user_id,
                MediaItemRecord.status == status,
            )
        )
        session.commit()
        return result.rowcount
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()


def save_media(
    items: list[MediaRating],
    user_id: int,
    status: str = "watched",
    db: Optional[Session] = None,
) -> list[MediaItemRecord]:
    """Persist a list of imported MediaRating objects for a user with the given status."""
    session, close_db = _resolve_db(db)
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
            session.add(record)
            records.append(record)
        session.commit()
        # Explicit refresh is intentionally omitted. After commit() the
        # instances are expired (expire_on_commit=True is the default).
        # The primary key id is already populated by SQLite's lastrowid,
        # and other attributes will be auto-refreshed on first access
        # (lazy loading) while the session is still open.
        return records
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()


def save_wishlist_items(
    items: list[WishlistItem],
    user_id: int,
    db: Optional[Session] = None,
) -> list[MediaItemRecord]:
    """Persist a list of wishlist items for a user."""
    session, close_db = _resolve_db(db)
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
            session.add(record)
            records.append(record)
        session.commit()
        return records
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()


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
    genre: Optional[str] = None,
    country: Optional[str] = None,
    db: Optional[Session] = None,
) -> tuple[list[MediaItemRecord], int]:
    """List saved media items for a user with optional search, status filter, rating range,
    scrape_error filter, media_type filter, genre filter, country filter, pagination, and sort."""
    session, close_db = _resolve_db(db)
    try:
        query = select(MediaItemRecord).where(MediaItemRecord.user_id == user_id)
        if status:
            query = query.where(MediaItemRecord.status == status)
        if media_type:
            query = query.where(MediaItemRecord.media_type == media_type)
        if genre:
            # Support comma-separated genres (OR logic)
            genre_list = [g.strip() for g in genre.split(",") if g.strip()]
            if len(genre_list) == 1:
                escaped_genre = genre_list[0].replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                query = query.where(MediaItemRecord.genre.ilike(f"%{escaped_genre}%", escape="\\"))
            else:
                from sqlalchemy import or_
                conditions = []
                for g in genre_list:
                    escaped = g.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                    conditions.append(MediaItemRecord.genre.ilike(f"%{escaped}%", escape="\\"))
                query = query.where(or_(*conditions))
        if country:
            # Support comma-separated countries (OR logic)
            country_list = [c.strip() for c in country.split(",") if c.strip()]
            if len(country_list) == 1:
                escaped_country = country_list[0].replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                query = query.where(MediaItemRecord.country.ilike(f"%{escaped_country}%", escape="\\"))
            else:
                from sqlalchemy import or_
                conditions = []
                for c in country_list:
                    escaped = c.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                    conditions.append(MediaItemRecord.country.ilike(f"%{escaped}%", escape="\\"))
                query = query.where(or_(*conditions))
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

        total = session.scalar(
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
            session.exec(
                query.order_by(order_fn())
                .offset(page * page_size)
                .limit(page_size)
            ).all()
        )

        # ── TV series grouping: ensure no season group is split across pages ──
        # Collect ALL tv_series_ids that appear on this page and fetch their
        # remaining seasons from any page, so the frontend can group them
        # correctly regardless of pagination. This handles:
        #   - Forward overflow: seasons on subsequent pages
        #   - Backward overflow: seasons on previous pages
        #   - Multiple series crossing page boundaries simultaneously
        tv_series_ids: set[str | None] = {r.tv_series_id for r in records}
        tv_series_ids.discard(None)
        if tv_series_ids:
            existing_ids = {r.id for r in records}
            extra_records: list[MediaItemRecord] = []
            for series_id in tv_series_ids:
                extras = list(
                    session.exec(
                        select(MediaItemRecord)
                        .where(
                            MediaItemRecord.user_id == user_id,
                            MediaItemRecord.tv_series_id == series_id,
                            MediaItemRecord.id.notin_(existing_ids),
                        )
                        .order_by(order_fn())
                    ).all()
                )
                extra_records.extend(extras)
                existing_ids.update(r.id for r in extras)
            records.extend(extra_records)
            # 当前页实际展示 items 数已超出 page_size，同步上调 total
            # 使前端分页计算 (ceil(total / page_size)) 保持一致
            total += len(extra_records)

        return records, total
    finally:
        if close_db:
            session.close()


def get_media_titles(user_id: int, db: Optional[Session] = None) -> list[str]:
    """Return just the titles of all media items for a user (lightweight, no pagination)."""
    session, close_db = _resolve_db(db)
    try:
        results = session.exec(
            select(MediaItemRecord.title).where(MediaItemRecord.user_id == user_id)
        ).all()
        return list(results)
    finally:
        if close_db:
            session.close()


def get_media_for_user(media_id: int, user_id: int, db: Optional[Session] = None) -> Optional[MediaItemRecord]:
    """Get a media item by ID, ensuring it belongs to the user."""
    session, close_db = _resolve_db(db)
    try:
        return session.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.id == media_id, MediaItemRecord.user_id == user_id
            )
        ).first()
    finally:
        if close_db:
            session.close()


def mark_media_as_watched(
    media_id: int,
    user_id: int,
    rating: float = 5.0,
    db: Optional[Session] = None,
) -> Optional[MediaItemRecord]:
    """Move a media item from wishlist to watched with a rating."""
    session, close_db = _resolve_db(db)
    try:
        record = session.exec(
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
        session.commit()
        # Explicit refresh is intentionally omitted. After commit() the
        # instance is expired but remains in the session identity map.
        # Attributes will be auto-refreshed (lazy loaded) on first access
        # while the session is still open.
        return record
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()


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
    runtime: Optional[int] = None,
    imdb_id: Optional[str] = None,
    tmdb_id: Optional[str] = None,
    country: Optional[str] = None,
    tagline: Optional[str] = None,
    media_type: Optional[str] = None,
    tv_series_id: Optional[str] = None,
    season_number: Optional[int] = None,
    episode_count: Optional[int] = None,
    series_poster_url: Optional[str] = None,
    created_at: Optional[str] = None,
    db: Optional[Session] = None,
) -> Optional[MediaItemRecord]:
    """Update a media record. Returns updated record or None if not found."""
    session, close_db = _resolve_db(db)
    try:
        record = session.exec(
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
        if media_type is not None:
            record.media_type = media_type
        # === Metadata fields ===
        if poster_url is not None:
            record.poster_url = poster_url
        if overview is not None:
            record.overview = overview
        if runtime is not None:
            record.runtime = runtime
        if imdb_id is not None:
            record.imdb_id = imdb_id
        if tmdb_id is not None:
            record.tmdb_id = tmdb_id
        if country is not None:
            record.country = country
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
        session.commit()
        return record
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()


def batch_delete_media(media_ids: list[int], user_id: int, db: Optional[Session] = None) -> int:
    """Delete multiple media items by IDs (must all belong to user). Returns count."""
    session, close_db = _resolve_db(db)
    try:
        result = session.exec(
            sa_delete(MediaItemRecord).where(
                MediaItemRecord.id.in_(media_ids),
                MediaItemRecord.user_id == user_id,
            )
        )
        session.commit()
        return result.rowcount
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()


def enrich_media_metadata(
    media_id: int,
    user_id: int,
    metadata: dict[str, Any],
    db: Optional[Session] = None,
) -> Optional[MediaItemRecord]:
    """Update a media record with scraped metadata fields.
    Only updates fields that are present in the metadata dict.
    """
    session, close_db = _resolve_db(db)
    try:
        record = session.exec(
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

            "runtime": "runtime",
            "imdb_id": "imdb_id",
            "tmdb_id": "tmdb_id",
            "country": "country",
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

        # ── Update year from scraped data ─────────────────────────────
        # For movies: use TMDB release_date directly.
        # For TV series: prefer the season's air date over the series'
        # first air date.  e.g. "黑袍纠察队 第四季" aired in 2022,
        # but the series premiered in 2019 — the season air date is
        # far more useful.
        if "year" in metadata and metadata["year"] is not None:
            if metadata.get("media_type") == "tv":
                season_air = metadata.get("season_air_date")
                if season_air:
                    try:
                        season_year = int(str(season_air)[:4])
                        record.year = season_year
                    except (ValueError, TypeError):
                        # season_air_date is not parseable — fall back
                        # to the series first air year
                        record.year = metadata["year"]
                else:
                    record.year = metadata["year"]
            else:
                record.year = metadata["year"]

        session.commit()
        return record
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()


def set_scrape_error(media_id: int, user_id: int, error: str, db: Optional[Session] = None):
    """Record a scrape error message for a media item."""
    session, close_db = _resolve_db(db)
    try:
        record = session.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.id == media_id, MediaItemRecord.user_id == user_id
            )
        ).first()
        if record:
            record.scrape_error = error
            session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()


def clear_scrape_error(media_id: int, user_id: int, db: Optional[Session] = None):
    """Clear the scrape error for a media item (on successful scrape)."""
    session, close_db = _resolve_db(db)
    try:
        record = session.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.id == media_id, MediaItemRecord.user_id == user_id
            )
        ).first()
        if record:
            record.scrape_error = None
            session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()


def get_unenriched_media_ids(user_id: int, db: Optional[Session] = None) -> list[int]:
    """Return IDs of all media items for a user that need metadata enrichment.

    Includes items where:
    - ``poster_url`` is ``NULL`` (never scraped), OR
    - ``poster_url`` points to ``/static/...`` but the file is missing on disk
      (e.g. Docker volume was reset, files manually deleted)

    This ensures that ``enrich-all`` re-downloads posters for items whose
    local files have been lost.
    """
    from poster_cache import local_poster_file_exists

    session, close_db = _resolve_db(db)
    try:
        # Items with NULL poster_url
        null_records = session.exec(
            select(MediaItemRecord.id).where(
                MediaItemRecord.user_id == user_id,
                MediaItemRecord.poster_url.is_(None),
            )
        ).all()
        result: list[int] = [r for r in null_records]

        # Items with /static/ poster_url but missing file on disk
        local_records = session.exec(
            select(MediaItemRecord.id, MediaItemRecord.poster_url).where(
                MediaItemRecord.user_id == user_id,
                MediaItemRecord.poster_url.isnot(None),
                MediaItemRecord.poster_url.like("/static/%"),
            )
        ).all()
        for r in local_records:
            if not local_poster_file_exists(r.poster_url):
                result.append(r.id)

        return result
    finally:
        if close_db:
            session.close()


def get_external_poster_media_ids(user_id: int, db: Optional[Session] = None) -> list[tuple[int, str, str | None]]:
    """Return (id, poster_url, tmdb_id) for media items whose poster_url points
    to an external CDN (i.e. not a local ``/static/`` path).

    These are items that were scraped before local poster caching was
    introduced — they have valid poster URLs from TMDB but the image
    hasn't been downloaded to the local filesystem yet.
    """
    session, close_db = _resolve_db(db)
    try:
        records = session.exec(
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
        if close_db:
            session.close()


def get_enrich_progress(user_id: int, db: Optional[Session] = None) -> tuple[int, int, int]:
    """Count total, processed, and failed items for enrichment progress.

    "Processed" means the item either has a poster_url (success)
    or has a scrape_error (failure — TMDB couldn't find it, etc.).
    "Failed" means scrape_error is set but poster_url is still NULL
    (i.e. processed but unsuccessful).

    Returns (total, processed, failed).
    """
    session, close_db = _resolve_db(db)
    try:
        total = session.scalar(
            select(sa_func.count()).select_from(
                select(MediaItemRecord).where(MediaItemRecord.user_id == user_id).subquery()
            )
        ) or 0
        processed = session.scalar(
            select(sa_func.count()).select_from(
                select(MediaItemRecord).where(
                    MediaItemRecord.user_id == user_id,
                    sa_func.coalesce(MediaItemRecord.poster_url, MediaItemRecord.scrape_error).isnot(None),
                ).subquery()
            )
        ) or 0
        failed = session.scalar(
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
        if close_db:
            session.close()


def delete_media(media_id: int, user_id: int, db: Optional[Session] = None) -> bool:
    """Delete a media item by ID (must belong to user)."""
    session, close_db = _resolve_db(db)
    try:
        record = session.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.id == media_id, MediaItemRecord.user_id == user_id
            )
        ).first()
        if not record:
            return False
        session.delete(record)
        session.commit()
        return True
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()


# ── Top 10 customization ────────────────────────────────────────


def get_top_rated(
    user_id: int,
    db: Optional[Session] = None,
) -> list[dict]:
    """Return the user's curated top-rated list.

    Only returns items that are explicitly pinned (pinned=True).
    Items are sorted by sort_order ascending, then by rating descending
    as a tiebreaker. Returns up to 10 items.
    """
    session, close_db = _resolve_db(db)
    try:
        records = session.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.user_id == user_id,
                MediaItemRecord.status == "watched",
                MediaItemRecord.hidden_from_top == False,
                MediaItemRecord.pinned == True,
            )
        ).all()

        # Sort: by sort_order (non-null first), then by rating desc
        def sort_key(r: MediaItemRecord):
            return (
                0 if r.sort_order is not None else 1,
                r.sort_order or 0,
                -r.rating,
                -(r.created_at.timestamp() if r.created_at else 0),
            )

        sorted_records = sorted(records, key=sort_key)[:10]
        return [_media_to_dict(r) for r in sorted_records]
    finally:
        if close_db:
            session.close()


def add_to_top_rated(
    user_id: int,
    media_id: int,
    db: Optional[Session] = None,
) -> Optional[dict]:
    """Pin a media item to the top-rated list at the end.

    Sets ``pinned=True`` and assigns the next available ``sort_order``.
    Returns the item dict on success, or ``None`` if the item doesn't
    exist / isn't watched.
    """
    session, close_db = _resolve_db(db)
    try:
        record = session.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.id == media_id,
                MediaItemRecord.user_id == user_id,
            )
        ).first()
        if not record:
            return None

        # Already pinned — just return it
        if record.pinned and not record.hidden_from_top:
            return _media_to_dict(record)

        # Enforce maximum of 10 items in the top rated list
        current_count = session.scalar(
            select(sa_func.count()).select_from(
                select(MediaItemRecord).where(
                    MediaItemRecord.user_id == user_id,
                    MediaItemRecord.pinned == True,
                    MediaItemRecord.hidden_from_top == False,
                ).subquery()
            )
        ) or 0
        if current_count >= 10:
            return None

        # Find current max sort_order
        max_order = session.scalar(
            select(sa_func.max(MediaItemRecord.sort_order)).where(
                MediaItemRecord.user_id == user_id,
                MediaItemRecord.pinned == True,
            )
        ) or 0

        record.pinned = True
        record.hidden_from_top = False
        record.sort_order = max_order + 1
        session.commit()
        return _media_to_dict(record)
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()


def remove_from_top_rated(
    user_id: int,
    media_id: int,
    db: Optional[Session] = None,
) -> bool:
    """Unpin a media item from the top-rated list.

    Sets ``pinned=False``, ``sort_order=None``, ``hidden_from_top=True``.
    Returns ``True`` on success.
    """
    session, close_db = _resolve_db(db)
    try:
        record = session.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.id == media_id,
                MediaItemRecord.user_id == user_id,
            )
        ).first()
        if not record:
            return False

        record.pinned = False
        record.sort_order = None
        record.hidden_from_top = True
        session.commit()
        return True
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()


def reorder_top_rated(
    user_id: int,
    ordered_ids: list[int],
    db: Optional[Session] = None,
) -> None:
    """Update sort_order for items based on their position in ordered_ids.

    Items not in the list get sort_order set to None.
    """
    session, close_db = _resolve_db(db)
    try:
        # Reset all existing sort_orders for this user
        all_records = session.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.user_id == user_id,
                MediaItemRecord.sort_order.isnot(None),
            )
        ).all()
        for r in all_records:
            r.sort_order = None

        # Set new sort_order based on position
        for i, media_id in enumerate(ordered_ids):
            record = session.exec(
                select(MediaItemRecord).where(
                    MediaItemRecord.id == media_id,
                    MediaItemRecord.user_id == user_id,
                )
            ).first()
            if record:
                record.sort_order = i
                record.pinned = True
                record.hidden_from_top = False

        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        if close_db:
            session.close()



def _media_to_dict(r: MediaItemRecord) -> dict:
    """Serialize a MediaItemRecord to a dict for API responses."""
    return {
        "id": r.id,
        "title": r.title,
        "rating": r.rating,
        "year": r.year,
        "genre": r.genre,
        "status": r.status,
        "media_type": r.media_type or "movie",
        "poster_url": r.poster_url,
        "overview": r.overview,

        "runtime": r.runtime,
        "imdb_id": r.imdb_id,
        "tmdb_id": r.tmdb_id,
        "country": r.country,
        "tagline": r.tagline,
        "scrape_error": r.scrape_error,
        "season_number": r.season_number,
        "episode_count": r.episode_count,
        "pinned": r.pinned,
        "hidden_from_top": r.hidden_from_top,
        "sort_order": r.sort_order,
        "created_at": r.created_at.isoformat() if r.created_at else "",
    }


def get_media_stats(user_id: int, db: Optional[Session] = None) -> dict:
    """Return aggregated statistics for a user's media library.

    Returns a dict with:
    - total_watched / total_wishlist / total
    - rating_distribution: list of {range, count}
    - year_distribution: list of {year, count}
    - genre_distribution: list of {genre, count}
    - media_type_distribution: list of {type, count}
    - monthly_trend: list of {month, count}
    - avg_rating, top_rated, recent_additions
    """
    session, close_db = _resolve_db(db)
    try:
        # Fetch ALL media for this user
        records = session.exec(
            select(MediaItemRecord).where(
                MediaItemRecord.user_id == user_id
            ).order_by(MediaItemRecord.created_at.desc())
        ).all()

        total = len(records)
        watched = [r for r in records if r.status == "watched"]
        wishlist = [r for r in records if r.status == "wish"]

        # ── Rating distribution (watched only) ────────────────
        rating_buckets = [0] * 5  # 0-2, 2-4, 4-6, 6-8, 8-10
        for r in watched:
            bucket = min(int(r.rating // 2), 4)
            rating_buckets[bucket] += 1
        rating_distribution = [
            {"range": f"{i*2}-{i*2+2}", "count": rating_buckets[i]}
            for i in range(5)
        ]

        # ── Year distribution ─────────────────────────────────
        year_counter: Counter = Counter()
        for r in records:
            if r.year:
                year_counter[r.year] += 1
        year_distribution = [
            {"year": y, "count": c}
            for y, c in sorted(year_counter.items(), reverse=True)
        ]

        # ── Decade distribution ───────────────────────────────
        decade_counter: Counter = Counter()
        for r in records:
            if r.year:
                decade = (r.year // 10) * 10
                decade_counter[decade] += 1
        decade_distribution = [
            {"decade": f"{d}s", "count": c}
            for d, c in sorted(decade_counter.items(), reverse=True)
        ]

        # ── Country distribution ────────────────────────────
        country_counter: Counter = Counter()
        for r in records:
            if r.country:
                # Normalize: split by "/" (e.g. "United States / China")
                for c in r.country.split("/"):
                    c = c.strip()
                    if c:
                        country_counter[c] += 1
        country_distribution = [
            {"country": c, "count": n}
            for c, n in country_counter.most_common()
        ]

        # ── Genre distribution (normalize separators first) ────
        genre_counter: Counter = Counter()
        for r in records:
            if r.genre:
                # Normalize: replace "/" and "," with " / " then split
                normalized = r.genre.replace("/", " / ").replace(",", " / ")
                for g in normalized.split(" / "):
                    g = g.strip()
                    if g:
                        genre_counter[g] += 1
        genre_distribution = [
            {"genre": g, "count": c}
            for g, c in genre_counter.most_common()
        ]

        # ── Media type distribution ───────────────────────────
        type_counter: Counter = Counter()
        for r in records:
            type_counter[r.media_type or "movie"] += 1
        media_type_distribution = [
            {"type": t, "count": c}
            for t, c in type_counter.most_common()
        ]

        # ── Monthly trend (by created_at) ─────────────────────
        month_counter: Counter = Counter()
        for r in records:
            key = r.created_at.strftime("%Y-%m")
            month_counter[key] += 1
        monthly_trend = [
            {"month": m, "count": c}
            for m, c in sorted(month_counter.items())
        ]

        # ── Top rated (user's curated Top 10 list) ────────────
        # Return the user's manually pinned & ordered top-rated list.
        # Falls back to empty list if the user hasn't curated one yet.
        top_rated = get_top_rated(user_id, db=session)

        # ── Total watch time (minutes, watched only) ───────────
        # For movies: runtime = movie length (e.g. 142 min)
        # For TV series: runtime = per-episode, so multiply by episode_count
        total_watch_time = sum(
            (r.runtime * r.episode_count)
            if (r.media_type == "tv" and r.episode_count and r.runtime)
            else r.runtime
            for r in watched
            if r.runtime is not None
        )

        # ── Avg rating ────────────────────────────────────────
        avg_rating = (
            round(sum(r.rating for r in watched) / len(watched), 1)
            if watched else 0
        )

        # ── Recent additions ──────────────────────────────────
        recent = records[:10]

        return {
            "total": total,
            "total_watched": len(watched),
            "total_wishlist": len(wishlist),
            "total_watch_time": total_watch_time,
            "avg_rating": avg_rating,
            "rating_distribution": rating_distribution,
            "year_distribution": year_distribution,
            "decade_distribution": decade_distribution,
            "country_distribution": country_distribution,
            "genre_distribution": genre_distribution,
            "media_type_distribution": media_type_distribution,
            "monthly_trend": monthly_trend,
            "top_rated": top_rated,
            "recent_additions": [
                {
                    "title": r.title,
                    "status": r.status,
                    "created_at": r.created_at.isoformat(),
                }
                for r in recent
            ],
        }
    finally:
        if close_db:
            session.close()
