"""Database CRUD operations using SQLModel select/exec patterns."""

from datetime import datetime, timezone
from typing import Optional, Any

from passlib.hash import bcrypt
from sqlalchemy import func as sa_func
from sqlmodel import Session, select, delete as sa_delete

from database import get_session
from models import (
    UserRecord,
    MovieRecord,
    SessionRecord,
    RecommendationRecord,
    MovieRating,
    MovieRecommendation,
    WishlistItem,
)


# ============================================
# Auth / Users
# ============================================


def create_user(username: str, password: str, is_admin: bool = False) -> UserRecord:
    """Create a new user. Raises ValueError if username already exists."""
    db = get_session()
    try:
        existing = db.exec(
            select(UserRecord).where(UserRecord.username == username)
        ).first()
        if existing:
            raise ValueError(f"User '{username}' already exists")
        user = UserRecord(
            username=username,
            password_hash=bcrypt.hash(password),
            is_admin=is_admin,
            created_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def authenticate_user(username: str, password: str) -> Optional[UserRecord]:
    """Verify username/password. Returns UserRecord on success, None on failure."""
    db = get_session()
    try:
        user = db.exec(
            select(UserRecord).where(UserRecord.username == username)
        ).first()
        if not user:
            return None
        if not bcrypt.verify(password, user.password_hash):
            return None
        return user
    finally:
        db.close()


def get_user_by_id(user_id: int) -> Optional[UserRecord]:
    """Get a user by ID."""
    db = get_session()
    try:
        return db.exec(
            select(UserRecord).where(UserRecord.id == user_id)
        ).first()
    finally:
        db.close()


def change_password(user_id: int, old_password: str, new_password: str) -> bool:
    """Change a user's password. Returns True on success, False if old password is wrong."""
    db = get_session()
    try:
        user = db.exec(
            select(UserRecord).where(UserRecord.id == user_id)
        ).first()
        if not user:
            return False
        if not bcrypt.verify(old_password, user.password_hash):
            return False
        user.password_hash = bcrypt.hash(new_password)
        db.commit()
        return True
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def list_users() -> list[UserRecord]:
    """List all users (admin panel)."""
    db = get_session()
    try:
        results = db.exec(
            select(UserRecord).order_by(UserRecord.created_at.desc())
        ).all()
        return list(results)
    finally:
        db.close()


def admin_delete_user(target_user_id: int) -> bool:
    """Admin: delete a user (cannot delete self). Returns True if deleted."""
    db = get_session()
    try:
        user = db.exec(
            select(UserRecord).where(UserRecord.id == target_user_id)
        ).first()
        if not user:
            return False
        db.delete(user)
        db.commit()
        return True
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def admin_reset_user_password(target_user_id: int, new_password: str) -> bool:
    """Admin: reset a user's password. Returns True if successful."""
    db = get_session()
    try:
        user = db.exec(
            select(UserRecord).where(UserRecord.id == target_user_id)
        ).first()
        if not user:
            return False
        user.password_hash = bcrypt.hash(new_password)
        db.commit()
        return True
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ============================================
# Movies (user-scoped)
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
) -> tuple[list[MovieRecord], int]:
    """List saved movies for a user with optional search, status filter, rating range,
    scrape_error filter, pagination, and sort."""
    db = get_session()
    try:
        query = select(MovieRecord).where(MovieRecord.user_id == user_id)
        if status:
            query = query.where(MovieRecord.status == status)
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
        # NOTE: title / year / genre are intentionally excluded — they
        # come from the user's import and must not be overwritten by
        # TMDB/OMDb data (which may differ in language or formatting).
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


# ============================================
# Sessions (user-scoped)
# ============================================


def save_session(
    model: str,
    source_count: int,
    movies: list[MovieRating],
    recommendations: list[MovieRecommendation],
    user_id: int,
) -> SessionRecord:
    """Create a recommendation session for a user.

    Note: ``movies`` is kept for API compatibility but is not persisted.
    Only the recommendation results are stored."""
    db = get_session()
    try:
        session = SessionRecord(
            model=model,
            source_count=source_count,
            user_id=user_id,
            created_at=datetime.now(timezone.utc),
        )
        db.add(session)
        db.flush()

        now = datetime.now(timezone.utc)
        for rec in recommendations:
            rec_record = RecommendationRecord(
                title=rec.title,
                year=rec.year,
                genre=rec.genre,
                reason=rec.reason,
                confidence=rec.confidence,
                session_id=session.id,
                created_at=now,
            )
            db.add(rec_record)

        db.commit()
        db.refresh(session)
        return session
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_sessions(
    user_id: int, page: int = 0, page_size: int = 20
) -> tuple[list[SessionRecord], int]:
    """List sessions for a user with pagination."""
    db = get_session()
    try:
        base = select(SessionRecord).where(SessionRecord.user_id == user_id)
        total = db.scalar(
            select(sa_func.count()).select_from(base.subquery())
        ) or 0
        sessions = list(
            db.exec(
                base.order_by(SessionRecord.created_at.desc())
                .offset(page * page_size)
                .limit(page_size)
            ).all()
        )
        return sessions, total
    finally:
        db.close()


def get_session_detail(session_id: int, user_id: int) -> Optional[SessionRecord]:
    """Get a single session (must belong to user)."""
    db = get_session()
    try:
        return db.exec(
            select(SessionRecord).where(
                SessionRecord.id == session_id,
                SessionRecord.user_id == user_id,
            )
        ).first()
    finally:
        db.close()


def delete_session(session_id: int, user_id: int) -> bool:
    """Delete a session (must belong to user)."""
    db = get_session()
    try:
        session = db.exec(
            select(SessionRecord).where(
                SessionRecord.id == session_id,
                SessionRecord.user_id == user_id,
            )
        ).first()
        if not session:
            return False
        db.delete(session)
        db.commit()
        return True
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
