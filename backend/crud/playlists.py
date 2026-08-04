"""Playlist (片单) CRUD operations.

Playlists live in the per-user databases alongside media_items, so all
functions operate on the user's own ``Session`` (passed via ``db``).
"""

from datetime import datetime, timezone
import secrets
from typing import Optional

from sqlmodel import Session, select

from models import PlaylistRecord, PlaylistItemRecord


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_playlist(
    user_id: int,
    name: str,
    description: Optional[str] = None,
    db: Optional[Session] = None,
) -> PlaylistRecord:
    """Create a new playlist for a user."""
    playlist = PlaylistRecord(
        user_id=user_id,
        name=name.strip(),
        description=description,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return playlist


def get_playlist(
    user_id: int,
    playlist_id: int,
    db: Session,
) -> Optional[PlaylistRecord]:
    """Get a single playlist (must belong to user)."""
    return db.exec(
        select(PlaylistRecord).where(
            PlaylistRecord.id == playlist_id,
            PlaylistRecord.user_id == user_id,
        )
    ).first()


def get_playlist_by_token(token: str, user_id: int, db: Session) -> Optional[PlaylistRecord]:
    """Find a playlist by its public share token (within a user's DB)."""
    return db.exec(
        select(PlaylistRecord).where(
            PlaylistRecord.share_token == token,
            PlaylistRecord.user_id == user_id,
        )
    ).first()


def list_playlists(
    user_id: int,
    db: Session,
) -> list[PlaylistRecord]:
    """List all playlists for a user, newest first."""
    return list(
        db.exec(
            select(PlaylistRecord)
            .where(PlaylistRecord.user_id == user_id)
            .order_by(PlaylistRecord.updated_at.desc())
        ).all()
    )


def update_playlist(
    user_id: int,
    playlist_id: int,
    db: Session,
    name: Optional[str] = None,
    description: Optional[str] = None,
) -> Optional[PlaylistRecord]:
    """Rename / update a playlist's metadata."""
    playlist = get_playlist(user_id, playlist_id, db)
    if not playlist:
        return None
    if name is not None and name.strip():
        playlist.name = name.strip()
    if description is not None:
        playlist.description = description
    playlist.updated_at = _now()
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return playlist


def delete_playlist(user_id: int, playlist_id: int, db: Session) -> bool:
    """Delete a playlist and all its items (cascade)."""
    playlist = get_playlist(user_id, playlist_id, db)
    if not playlist:
        return False
    db.delete(playlist)
    db.commit()
    return True


# ── Sharing ───────────────────────────────────────────────────────


def _generate_share_token(user_id: int) -> str:
    """Generate a public share token embedding the user id.

    Format: ``{user_id}.{random_token}`` — the prefix lets the public
    share endpoint resolve which per-user database to open without
    scanning every user's DB. The random suffix (16 bytes) is
    unguessable, so tokens cannot be enumerated.
    """
    return f"{user_id}.{secrets.token_urlsafe(16)}"


def enable_share(user_id: int, playlist_id: int, db: Session) -> Optional[str]:
    """Enable sharing for a playlist; returns the share token (or existing one)."""
    playlist = get_playlist(user_id, playlist_id, db)
    if not playlist:
        return None
    if not playlist.share_token:
        playlist.share_token = _generate_share_token(user_id)
        playlist.updated_at = _now()
        db.add(playlist)
        db.commit()
        db.refresh(playlist)
    return playlist.share_token


def disable_share(user_id: int, playlist_id: int, db: Session) -> bool:
    """Disable sharing — revokes the token so old links stop working."""
    playlist = get_playlist(user_id, playlist_id, db)
    if not playlist:
        return False
    playlist.share_token = None
    playlist.updated_at = _now()
    db.add(playlist)
    db.commit()
    return True


# ── Items ─────────────────────────────────────────────────────────


def list_items(playlist_id: int, db: Session) -> list[PlaylistItemRecord]:
    """List a playlist's items ordered by sort_order then created_at."""
    return list(
        db.exec(
            select(PlaylistItemRecord)
            .where(PlaylistItemRecord.playlist_id == playlist_id)
            .order_by(PlaylistItemRecord.sort_order.asc(), PlaylistItemRecord.created_at.asc())
        ).all()
    )


def _item_matches(item: PlaylistItemRecord, tmdb_id: Optional[str], title: Optional[str], year: Optional[int]) -> bool:
    """Check whether an existing item duplicates a new candidate."""
    if tmdb_id and item.tmdb_id and item.tmdb_id == tmdb_id:
        return True
    if title and item.title:
        if item.title.strip().lower() == title.strip().lower():
            # Year must also match when both present (avoids merging
            # distinct films that share a title, e.g. remakes)
            if item.year is not None and year is not None:
                return item.year == year
            return True
    return False


def playlist_items_contain_item(
    items: list[PlaylistItemRecord],
    media_id: Optional[int] = None,
    tmdb_id: Optional[str] = None,
    title: Optional[str] = None,
    year: Optional[int] = None,
) -> bool:
    """Whether any of the given playlist items matches a candidate item.

    Matches by a direct ``media_id`` reference first, then by the same
    rules as :func:`add_item` dedup (tmdb_id, or title+year). Used to
    flag playlists that already contain an item in the add-to-playlist
    modal, so it can show "已添加" instead of an add button.
    """
    for i in items:
        if media_id is not None and i.media_id is not None and i.media_id == media_id:
            return True
        if _item_matches(i, tmdb_id, title, year):
            return True
    return False


def add_item(
    user_id: int,
    playlist_id: int,
    db: Session,
    media_id: Optional[int] = None,
    title: Optional[str] = None,
    year: Optional[int] = None,
    genre: Optional[str] = None,
    media_type: Optional[str] = None,
    poster_url: Optional[str] = None,
    overview: Optional[str] = None,
    tmdb_id: Optional[str] = None,
    country: Optional[str] = None,
    note: Optional[str] = None,
) -> tuple[PlaylistItemRecord | None, bool]:
    """Add an item to a playlist.

    Returns ``(item, added)`` where ``added=False`` means a duplicate
    was found and nothing was inserted (the existing item is returned).
    When ``media_id`` is provided the snapshot is auto-filled from the
    user's media library.
    """
    playlist = get_playlist(user_id, playlist_id, db)
    if not playlist:
        return None, False

    # Auto-fill snapshot from the user's media library when media_id given
    if media_id is not None:
        from models import MediaItemRecord
        rec = db.get(MediaItemRecord, media_id)
        if rec is None or rec.user_id != user_id:
            return None, False
        title = title or rec.title
        year = year if year is not None else rec.year
        genre = genre or rec.genre
        media_type = media_type or rec.media_type
        poster_url = poster_url or rec.poster_url
        overview = overview or rec.overview
        tmdb_id = tmdb_id or rec.tmdb_id
        country = country or rec.country

    if not title or not title.strip():
        return None, False

    existing_items = list_items(playlist_id, db)
    for existing in existing_items:
        if _item_matches(existing, tmdb_id, title, year):
            return existing, False

    next_sort = (max([i.sort_order or 0 for i in existing_items], default=0) + 1)
    item = PlaylistItemRecord(
        playlist_id=playlist_id,
        media_id=media_id,
        title=title.strip(),
        year=year,
        genre=genre,
        media_type=media_type or "movie",
        poster_url=poster_url,
        overview=overview,
        tmdb_id=tmdb_id,
        country=country,
        note=note,
        sort_order=next_sort,
        created_at=_now(),
    )
    db.add(item)

    # Refresh cover / updated_at
    playlist.cover_url = item.poster_url or playlist.cover_url
    playlist.updated_at = _now()
    db.add(playlist)
    db.commit()
    db.refresh(item)
    return item, True


def update_item(
    user_id: int,
    playlist_id: int,
    item_id: int,
    db: Session,
    note: Optional[str] = None,
    title: Optional[str] = None,
    year: Optional[int] = None,
    genre: Optional[str] = None,
    poster_url: Optional[str] = None,
) -> Optional[PlaylistItemRecord]:
    """Update a playlist item (verify it belongs to the user's playlist)."""
    playlist = get_playlist(user_id, playlist_id, db)
    if not playlist:
        return None
    item = db.get(PlaylistItemRecord, item_id)
    if item is None or item.playlist_id != playlist_id:
        return None
    if note is not None:
        item.note = note
    if title is not None and title.strip():
        item.title = title.strip()
    if year is not None:
        item.year = year
    if genre is not None:
        item.genre = genre
    if poster_url is not None:
        item.poster_url = poster_url
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def delete_item(user_id: int, playlist_id: int, item_id: int, db: Session) -> bool:
    """Remove an item from a playlist."""
    playlist = get_playlist(user_id, playlist_id, db)
    if not playlist:
        return False
    item = db.get(PlaylistItemRecord, item_id)
    if item is None or item.playlist_id != playlist_id:
        return False
    db.delete(item)
    db.commit()
    return True


def reorder_items(
    user_id: int,
    playlist_id: int,
    ordered_ids: list[int],
    db: Session,
) -> bool:
    """Reorder playlist items by an ordered list of item IDs."""
    playlist = get_playlist(user_id, playlist_id, db)
    if not playlist:
        return False
    items = list_items(playlist_id, db)
    id_to_item = {i.id: i for i in items}
    if set(ordered_ids) != set(id_to_item.keys()):
        return False
    for idx, item_id in enumerate(ordered_ids):
        id_to_item[item_id].sort_order = idx
    db.add_all(items)
    playlist.updated_at = _now()
    db.add(playlist)
    db.commit()
    return True
