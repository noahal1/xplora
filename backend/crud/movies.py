"""Movie CRUD operations (user-scoped)."""

from datetime import datetime, timezone
from typing import Optional, Any

from sqlalchemy import func as sa_func
from sqlmodel import Session, select, delete as sa_delete

from database import get_session
from models import MovieRecord, MovieRating, WishlistItem


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
# Movies
# ============================================


def delete_all_movies_for_user(user_id: int) -> int:
    """Delete all movie records for a specific user. Returns count."""
    db = get_session()
    try:
        result = db.exec(
            sa_delete(MovieRecord).where(MovieRecord.user_id == user_id)
        )
        db.commit()
        return result.rowcount
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def db_delete_movies_by_status(user_id: int, status: str) -> int:
    """Delete all movie records for a user with a specific status. Returns count."""
    db = get_session()
    try:
        result = db.exec(
            sa_delete(MovieRecord).where(
                MovieRecord.user_id == user_id,
                MovieRecord.status == status,
            )
        )
        db.commit()
        return result.rowcount
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def save_movies(
    movies: list[MovieRating],
    user_id: int,
    status: str = "watched",
) -> list[MovieRecord]:
    """Persist a list of imported MovieRating objects for a user with the given status."""
    db = get_session()
    try:
        records: list[MovieRecord] = []
        now = datetime.now(timezone.utc)
        for m in movies:
            record = MovieRecord(
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
) -> list[MovieRecord]:
    """Persist a list of wishlist items for a user."""
    db = get_session()
    try:
        records: list[MovieRecord] = []
        now = datetime.now(timezone.utc)
        for m in items:
            record = MovieRecord(
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


def get_movies(
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
) -> tuple[list[MovieRecord], int]:
    """List saved movies for a user with optional search, status filter, rating range,
    scrape_error filter, media_type filter, pagination, and sort."""
    db = get_session()
    try:
        query = select(MovieRecord).where(MovieRecord.user_id == user_id)
        if status:
            query = query.where(MovieRecord.status == status)
        if media_type:
            query = query.where(MovieRecord.media_type == media_type)
        if search:
            # Escape SQL LIKE wildcards in user input
            escaped_search = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            query = query.where(MovieRecord.title.ilike(f"%{escaped_search}%", escape="\\"))
        if rating_min is not None:
            query = query.where(MovieRecord.rating >= rating_min)
        if rating_max is not None:
            query = query.where(MovieRecord.rating <= rating_max)
        if has_error:
            query = query.where(MovieRecord.scrape_error.isnot(None))

        total = db.scalar(
            select(sa_func.count()).select_from(query.subquery())
        ) or 0

        # Map sort_field to model attribute (prevent injection)
        allowed_fields = {
            "title": MovieRecord.title,
            "rating": MovieRecord.rating,
            "year": MovieRecord.year,
            "genre": MovieRecord.genre,
            "created_at": MovieRecord.created_at,
        }
        order_col = allowed_fields.get(sort_field, MovieRecord.created_at)
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


def get_movie_titles(user_id: int) -> list[str]:
    """Return just the titles of all movies for a user (lightweight, no pagination)."""
    db = get_session()
    try:
        results = db.exec(
            select(MovieRecord.title).where(MovieRecord.user_id == user_id)
        ).all()
        return list(results)
    finally:
        db.close()


def get_movie_for_user(movie_id: int, user_id: int) -> Optional[MovieRecord]:
    """Get a movie by ID, ensuring it belongs to the user."""
    db = get_session()
    try:
        return db.exec(
            select(MovieRecord).where(
                MovieRecord.id == movie_id, MovieRecord.user_id == user_id
            )
        ).first()
    finally:
        db.close()


def mark_movie_as_watched(
    movie_id: int,
    user_id: int,
    rating: float = 5.0,
) -> Optional[MovieRecord]:
    """Move a movie from wishlist to watched with a rating."""
    db = get_session()
    try:
        record = db.exec(
            select(MovieRecord).where(
                MovieRecord.id == movie_id,
                MovieRecord.user_id == user_id,
                MovieRecord.status == "wish",
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


def update_movie(
    movie_id: int,
    user_id: int,
    title: str = None,
    rating: float = None,
    year: int = None,
    genre: str = None,
    status: str = None,
    poster_url: str = None,
    overview: str = None,
    director: str = None,
    actors: str = None,
    runtime: int = None,
    imdb_id: str = None,
    tmdb_id: str = None,
    country: str = None,
    awards: str = None,
    tagline: str = None,
    created_at: str = None,
) -> Optional[MovieRecord]:
    """Update a movie record. Returns updated record or None if not found."""
    db = get_session()
    try:
        record = db.exec(
            select(MovieRecord).where(
                MovieRecord.id == movie_id, MovieRecord.user_id == user_id
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


def batch_delete_movies(movie_ids: list[int], user_id: int) -> int:
    """Delete multiple movies by IDs (must all belong to user). Returns count."""
    db = get_session()
    try:
        result = db.exec(
            sa_delete(MovieRecord).where(
                MovieRecord.id.in_(movie_ids),
                MovieRecord.user_id == user_id,
            )
        )
        db.commit()
        return result.rowcount
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def enrich_movie_metadata(
    movie_id: int,
    user_id: int,
    metadata: dict[str, Any],
) -> Optional[MovieRecord]:
    """Update a movie record with scraped metadata fields.
    Only updates fields that are present in the metadata dict.
    """
    db = get_session()
    try:
        record = db.exec(
            select(MovieRecord).where(
                MovieRecord.id == movie_id, MovieRecord.user_id == user_id
            )
        ).first()
        if not record:
            return None

        # Map metadata fields to model attributes.
        # NOTE: title / year are intentionally excluded — they
        # come from the user's import and must not be overwritten by
        # TMDB/OMDb data (which may differ in language or formatting).
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
        }
        for key, attr in field_map.items():
            if key in metadata and metadata[key] is not None:
                setattr(record, attr, metadata[key])

        db.commit()
        db.refresh(record)
        return record
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def set_scrape_error(movie_id: int, user_id: int, error: str):
    """Record a scrape error message for a movie."""
    db = get_session()
    try:
        record = db.exec(
            select(MovieRecord).where(
                MovieRecord.id == movie_id, MovieRecord.user_id == user_id
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


def clear_scrape_error(movie_id: int, user_id: int):
    """Clear the scrape error for a movie (on successful scrape)."""
    db = get_session()
    try:
        record = db.exec(
            select(MovieRecord).where(
                MovieRecord.id == movie_id, MovieRecord.user_id == user_id
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


def get_unenriched_movie_ids(user_id: int) -> list[int]:
    """Return IDs of all movies for a user that don't have poster_url yet."""
    db = get_session()
    try:
        records = db.exec(
            select(MovieRecord.id).where(
                MovieRecord.user_id == user_id,
                MovieRecord.poster_url.is_(None),
            )
        ).all()
        return list(records)
    finally:
        db.close()


def get_external_poster_movie_ids(user_id: int) -> list[tuple[int, str, str | None]]:
    """Return (id, poster_url, tmdb_id) for movies whose poster_url points
    to an external CDN (i.e. not a local ``/static/`` path).

    These are movies that were scraped before local poster caching was
    introduced — they have valid poster URLs from TMDB but the image
    hasn't been downloaded to the local filesystem yet.
    """
    db = get_session()
    try:
        records = db.exec(
            select(MovieRecord.id, MovieRecord.poster_url, MovieRecord.tmdb_id).where(
                MovieRecord.user_id == user_id,
                MovieRecord.poster_url.isnot(None),
                MovieRecord.poster_url.not_like("/static/%"),
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
    """Count total, processed, and failed movies for enrichment progress.

    "Processed" means the movie either has a poster_url (success)
    or has a scrape_error (failure — TMDB couldn't find it, etc.).
    "Failed" means scrape_error is set but poster_url is still NULL
    (i.e. processed but unsuccessful).

    Returns (total, processed, failed).
    """
    db = get_session()
    try:
        total = db.scalar(
            select(sa_func.count()).select_from(
                select(MovieRecord).where(MovieRecord.user_id == user_id).subquery()
            )
        ) or 0
        processed = db.scalar(
            select(sa_func.count()).select_from(
                select(MovieRecord).where(
                    MovieRecord.user_id == user_id,
                    sa_func.coalesce(MovieRecord.poster_url, MovieRecord.scrape_error).isnot(None),
                ).subquery()
            )
        ) or 0
        failed = db.scalar(
            select(sa_func.count()).select_from(
                select(MovieRecord).where(
                    MovieRecord.user_id == user_id,
                    MovieRecord.poster_url.is_(None),
                    MovieRecord.scrape_error.isnot(None),
                ).subquery()
            )
        ) or 0
        return total, processed, failed
    finally:
        db.close()


def delete_movie(movie_id: int, user_id: int) -> bool:
    """Delete a movie by ID (must belong to user)."""
    db = get_session()
    try:
        record = db.exec(
            select(MovieRecord).where(
                MovieRecord.id == movie_id, MovieRecord.user_id == user_id
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
