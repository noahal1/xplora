"""Database setup — multi-tenant architecture with per-user SQLite databases.

Architecture:
  Master DB (data/xplora.db):      users table only
  Per-user DBs (data/user_{id}.db): media_items, sessions, recommendations, operation_logs

Each user's data is stored in their own SQLite database file, providing:
  - True data isolation between users
  - Simpler backup/export per user
  - No cross-user query overhead

Supports PostgreSQL for the master DB (with pg8000 driver) and SQLite per-user DBs.
Set the DATABASE_URL environment variable for the master DB, e.g.:
    PostgreSQL:  postgresql://user:password@localhost:5432/xplora
    SQLite:      sqlite:///data/xplora.db
"""

import os
import logging
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from passlib.hash import bcrypt
from sqlalchemy import event as sa_event
from sqlmodel import Session, SQLModel, select

from engine import build_engine
from models import UserRecord

logger = logging.getLogger(__name__)


def _is_sqlite(url: str) -> bool:
    """Check whether the DATABASE_URL points to a SQLite database."""
    return url.startswith("sqlite://") or url.startswith("sqlite+")


def _safe_int(value: str | None, default: int) -> int:
    """Parse an integer from an env var value; return ``default`` on failure."""
    if value is None or value.strip() == "":
        return default
    try:
        return int(value.strip())
    except (ValueError, TypeError):
        return default


# ---- Project root (where .env lives) ----

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _resolve_sqlite_path(url: str) -> str:
    """Resolve the filesystem path from a ``sqlite:///...`` URL.

    On Windows, ``sqlite:///data/xplora.db`` would normally resolve
    to the drive-root path ``C:/data/xplora.db``, which may not be
    writable (e.g. Microsoft Store Python sandbox). This function
    detects that case and instead resolves such paths relative to
    the project root, placing the DB at ``<project>/data/xplora.db``.

    On Unix the path is left as-is (absolute).
    """
    file_path = url.removeprefix("sqlite://")
    if os.name == "nt" and file_path.startswith("/"):
        # Windows: treat leading / as relative to project root
        relative = file_path.lstrip("/")
        return str((PROJECT_ROOT / relative).resolve())
    return file_path


def _resolve_sqlite_url(url: str) -> str:
    """Resolve a ``sqlite:///...`` URL to one with an absolute filesystem path.

    On Windows, converts ``sqlite:///data/xplora.db`` (which would
    resolve to drive root ``C:/data/xplora.db``) to a project-relative
    URL like ``sqlite:///C:/Users/.../data/xplora.db`` so SQLAlchemy
    can find the database file inside the project directory.

    On Unix, returns the URL unchanged.
    """
    file_path = _resolve_sqlite_path(url)
    # Normalise backslashes to forward slashes for URL format
    normalised = file_path.replace("\\", "/")
    return f"sqlite:///{normalised}"


# ---- Database URL ----


load_dotenv(PROJECT_ROOT / ".env")

MASTER_DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if not MASTER_DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Xplora requires a connection string, e.g.\n"
        "  PostgreSQL:  DATABASE_URL=postgresql://user:password@localhost:5432/xplora\n"
        "  SQLite:      DATABASE_URL=sqlite:///data/xplora.db"
    )

if not (MASTER_DATABASE_URL.startswith("postgresql") or _is_sqlite(MASTER_DATABASE_URL)):
    raise RuntimeError(
        "DATABASE_URL must start with 'postgresql://' or 'sqlite:///', got:\n"
        f"  {MASTER_DATABASE_URL}"
    )

# When using per-user SQLite databases, the master DB must also be SQLite
# so we can derive per-user DB paths from the master DB path.
USE_PER_USER_DBS = _is_sqlite(MASTER_DATABASE_URL)

# ---- Compute master DB directory (for per-user DB paths) ----


def _get_master_db_dir() -> str:
    """Get the directory containing the master DB file."""
    if _is_sqlite(MASTER_DATABASE_URL):
        file_path = _resolve_sqlite_path(MASTER_DATABASE_URL)
        return os.path.dirname(os.path.abspath(file_path))
    return os.getenv("DATA_DIR", "data")


def get_user_database_path(user_id: int) -> str:
    """Compute the filesystem path for a user's SQLite database."""
    data_dir = _get_master_db_dir()
    return os.path.join(data_dir, f"user_{user_id}.db")


def get_user_database_url(user_id: int) -> str:
    """Compute the SQLite URL for a user's database."""
    path = get_user_database_path(user_id)
    normalised = path.replace("\\", "/")
    return f"sqlite:///{normalised}"


# ---- Engine Factory ----


def _ensure_sqlite_dir(url: str):
    """Create the parent directory for a SQLite database file if it doesn't exist."""
    file_path = _resolve_sqlite_path(url)
    if file_path:
        db_dir = os.path.dirname(file_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)


def _create_sqlite_engine(url: str):
    """Create a SQLite engine with WAL mode and foreign keys enabled."""
    resolved_url = _resolve_sqlite_url(url)
    _ensure_sqlite_dir(url)
    engine = build_engine(
        resolved_url,
        echo=False,
        connect_args={"check_same_thread": False, "timeout": 5},
    )

    @sa_event.listens_for(engine, "connect")
    def _set_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


# ---- Master Engine ----


if _is_sqlite(MASTER_DATABASE_URL):
    _ensure_sqlite_dir(MASTER_DATABASE_URL)
    master_engine = _create_sqlite_engine(MASTER_DATABASE_URL)
else:
    pool_size = _safe_int(os.getenv("DB_POOL_SIZE"), 10)
    max_overflow = _safe_int(os.getenv("DB_MAX_OVERFLOW"), 20)
    pool_timeout = _safe_int(os.getenv("DB_POOL_TIMEOUT"), 30)
    pool_recycle = _safe_int(os.getenv("DB_POOL_RECYCLE"), 1800)
    pool_pre_ping = os.getenv("DB_POOL_PRE_PING", "true").lower() in ("true", "1", "yes")

    master_engine = build_engine(
        MASTER_DATABASE_URL,
        echo=False,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_timeout=pool_timeout,
        pool_recycle=pool_recycle,
        pool_pre_ping=pool_pre_ping,
        connect_args={"timeout": 5},
    )


# ---- Per-user Engine Cache ----

_user_engines: OrderedDict[int, any] = OrderedDict()
_MAX_USER_ENGINES = 100


def get_user_engine(user_id: int):
    """Get (or create) the SQLite engine for a specific user's database.

    Engines are cached in an LRU fashion.  When the cache exceeds
    ``_MAX_USER_ENGINES``, the least recently used engine is evicted
    to prevent unbounded memory growth.
    """
    if user_id in _user_engines:
        _user_engines.move_to_end(user_id)
        return _user_engines[user_id]

    url = get_user_database_url(user_id)
    engine = _create_sqlite_engine(url)

    # Evict the oldest engine if cache is full
    if len(_user_engines) >= _MAX_USER_ENGINES:
        oldest_user_id, _ = _user_engines.popitem(last=False)
        logger.info(f"Evicted engine for user id={oldest_user_id} (cache full)")

    _user_engines[user_id] = engine
    logger.info(f"Created engine for user DB: {url}")
    return engine


def init_user_database(user_id: int, username: str) -> None:
    """Create a user's database file with all tables and their user record.

    Called when a new user is registered. Creates the SQLite file with all
    data tables and inserts the user's own record into the users table for
    foreign key constraint compliance.
    """
    import models  # noqa: F401

    engine = get_user_engine(user_id)
    SQLModel.metadata.create_all(engine)

    # Run column migrations for this user's database (handles schema updates
    # for existing databases, e.g. when new columns are added in a new version)
    _run_per_user_column_migrations(user_id)

    db = Session(engine)
    try:
        existing = db.exec(
            select(UserRecord).where(UserRecord.id == user_id)
        ).first()
        if not existing:
            user = UserRecord(
                id=user_id,
                username=username,
                password_hash="",
                is_admin=False,
                created_at=datetime.now(timezone.utc),
            )
            db.add(user)
            db.commit()
            logger.info(f"Initialized database for user {username} (id={user_id})")
    finally:
        db.close()


def delete_user_database(user_id: int) -> None:
    """Delete a user's database file and remove from engine cache."""
    _user_engines.pop(user_id, None)
    db_path = get_user_database_path(user_id)
    if os.path.exists(db_path):
        os.remove(db_path)
        for ext in ("-wal", "-shm"):
            extra = db_path + ext
            if os.path.exists(extra):
                os.remove(extra)
        logger.info(f"Deleted database for user id={user_id}")


# ---- Session helpers ----


def get_session() -> Session:
    """Get a master DB session (for auth and admin operations)."""
    return Session(master_engine)


def get_user_session(user_id: int) -> Session:
    """Get a session to a specific user's database."""
    return Session(get_user_engine(user_id))


def get_db():
    """FastAPI dependency: master DB session (for auth routes)."""
    db = Session(master_engine)
    try:
        yield db
    finally:
        db.close()


# ============================================
# Per-user DB helper (FastAPI dependency is in deps.py)
# ============================================
# The ``get_user_db`` FastAPI dependency is defined in ``deps.py``
# to avoid circular imports: database → auth → crud.users → database.
# We keep the engine helpers here.


# ---- Init / Migrations ----


def _migrate_user_data_to_per_user_db(user: UserRecord, master_db: Session):
    """Migrate a single user's data from the shared master DB to their personal DB.

    Uses raw SQL for portability — reads from master DB, inserts into user DB.
    """
    from sqlmodel import text as sa_text

    user_db = get_user_session(user.id)
    try:
        # Check if migration already done for this user
        result = user_db.exec(sa_text("SELECT COUNT(*) FROM media_items")).scalar() or 0
        if result > 0:
            return  # Already migrated

        # Copy media_items
        rows = master_db.execute(
            sa_text("SELECT * FROM media_items WHERE user_id = :uid"),
            {"uid": user.id},
        ).fetchall()
        for row in rows:
            cols = [c for c in row._mapping.keys() if c != 'id']  # let auto-inc assign new id
            placeholders = ", ".join([f":{c}" for c in cols])
            col_names = ", ".join(cols)
            values = {c: row._mapping[c] for c in cols}
            user_db.execute(
                sa_text(f"INSERT INTO media_items ({col_names}) VALUES ({placeholders})"),
                values,
            )
        user_db.commit()

        # Copy sessions
        rows = master_db.execute(
            sa_text("SELECT * FROM sessions WHERE user_id = :uid"),
            {"uid": user.id},
        ).fetchall()
        for row in rows:
            cols = [c for c in row._mapping.keys() if c != 'id']
            placeholders = ", ".join([f":{c}" for c in cols])
            col_names = ", ".join(cols)
            values = {c: row._mapping[c] for c in cols}
            user_db.execute(
                sa_text(f"INSERT INTO sessions ({col_names}) VALUES ({placeholders})"),
                values,
            )
        user_db.commit()

        # Need to also copy recommendations with new session_ids
        # Get the old→new session ID mapping
        old_sessions = master_db.execute(
            sa_text("SELECT id FROM sessions WHERE user_id = :uid ORDER BY id"),
            {"uid": user.id},
        ).fetchall()
        new_sessions = user_db.execute(
            sa_text("SELECT id FROM sessions WHERE user_id = :uid ORDER BY id"),
            {"uid": user.id},
        ).fetchall()

        for old_row, new_row in zip(old_sessions, new_sessions):
            old_id = old_row._mapping["id"]
            new_id = new_row._mapping["id"]
            rec_rows = master_db.execute(
                sa_text("SELECT * FROM recommendations WHERE session_id = :sid"),
                {"sid": old_id},
            ).fetchall()
            for rec in rec_rows:
                cols = [c for c in rec._mapping.keys() if c not in ('id', 'session_id')]
                placeholders = ", ".join([f":{c}" for c in cols])
                col_names = ", ".join(cols)
                values = {c: rec._mapping[c] for c in cols}
                values["session_id"] = new_id
                user_db.execute(
                    sa_text(f"INSERT INTO recommendations (session_id, {col_names}) VALUES (:session_id, {placeholders})"),
                    values,
                )
        user_db.commit()

        # Copy operation_logs
        rows = master_db.execute(
            sa_text("SELECT * FROM operation_logs WHERE user_id = :uid"),
            {"uid": user.id},
        ).fetchall()
        for row in rows:
            cols = [c for c in row._mapping.keys() if c != 'id']
            placeholders = ", ".join([f":{c}" for c in cols])
            col_names = ", ".join(cols)
            values = {c: row._mapping[c] for c in cols}
            user_db.execute(
                sa_text(f"INSERT INTO operation_logs ({col_names}) VALUES ({placeholders})"),
                values,
            )
        user_db.commit()

        logger.info(f"Migrated data for user {user.username} (id={user.id})")
    except Exception:
        user_db.rollback()
        raise
    finally:
        user_db.close()


def init_db():
    """Create all tables in master DB, run migrations, migrate existing data to per-user DBs."""
    import models  # noqa: F401

    from sqlalchemy import inspect as _inspect

    # Create all tables in master DB
    SQLModel.metadata.create_all(master_engine)
    _rename_table_if_needed(_inspect(master_engine))
    _run_column_migrations()

    # Seed default admin user
    db = get_session()
    try:
        existing = db.exec(
            select(UserRecord).where(UserRecord.username == "admin")
        ).first()
        if not existing:
            admin = UserRecord(
                username="admin",
                password_hash=bcrypt.hash("admin123"),
                is_admin=True,
                created_at=datetime.now(timezone.utc),
            )
            db.add(admin)
            db.commit()
            print("  [Seed] Default admin user created (admin / admin123)")

        # Migrate existing data to per-user databases
        if USE_PER_USER_DBS:
            users = db.exec(select(UserRecord)).all()
            for user in users:
                init_user_database(user.id, user.username)
                _migrate_user_data_to_per_user_db(user, db)
                # Run column migrations on each user's database for new fields
                _run_per_user_column_migrations(user.id)
            if users:
                print(f"  [Migration] Per-user databases initialized for {len(users)} user(s)")

            # Clean up migrated data from master DB (keep only users table)
            # Delete in FK-safe order: child tables first, then parents
            from sqlmodel import text as sa_text
            for table in ("recommendations", "operation_logs", "sessions", "media_items"):
                db.execute(sa_text(f"DELETE FROM {table}"))
            db.commit()
            print("  [Migration] Cleaned up migrated data from master DB")
    finally:
        db.close()


# ---- Legacy migration helpers (kept for backward compatibility) ----


def _rename_table_if_needed(inspector):
    """Rename the old ``movies`` table to ``media_items`` if it still exists."""
    from sqlalchemy import text

    try:
        table_names = inspector.get_table_names()
    except Exception:
        return

    old_table = "movies"
    new_table = "media_items"

    has_old = old_table in table_names
    has_new = new_table in table_names

    if not has_old:
        return

    if has_old and not has_new:
        with master_engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {old_table} RENAME TO {new_table}"))
            conn.commit()
            print(f"  [Migration] Renamed table '{old_table}' → '{new_table}'")
        return

    if has_old and has_new:
        with master_engine.connect() as conn:
            row = conn.execute(text(f"SELECT COUNT(*) FROM {new_table}")).scalar()
            count = row or 0
        if count == 0:
            with master_engine.connect() as conn:
                conn.execute(text(f"DROP TABLE {new_table}"))
                conn.execute(text(f"ALTER TABLE {old_table} RENAME TO {new_table}"))
                conn.commit()
            print(f"  [Migration] Dropped empty '{new_table}', renamed '{old_table}' → '{new_table}'")
        else:
            with master_engine.connect() as conn:
                conn.execute(text(f"DROP TABLE {old_table}"))
                conn.commit()
            print(f"  [Migration] Dropped orphaned '{old_table}' — data already in '{new_table}' ({count} rows)")


def _run_column_migrations():
    """Run column-level schema migrations for the master DB."""
    from sqlalchemy import inspect, text

    inspector = inspect(master_engine)

    try:
        columns = [c["name"] for c in inspector.get_columns("media_items")]
    except Exception:
        return

    _add_columns_if_missing("media_items", columns, [
        ("status", "VARCHAR(20) NOT NULL DEFAULT 'watched'"),
        ("notes", "VARCHAR(500)"),
        ("poster_url", "VARCHAR(500)"),
        ("overview", "TEXT"),

        ("runtime", "INTEGER"),
        ("imdb_id", "VARCHAR(50)"),
        ("tmdb_id", "VARCHAR(50)"),
        ("country", "VARCHAR(100)"),
        ("tagline", "VARCHAR(500)"),
        ("scrape_error", "TEXT"),
        ("media_type", "VARCHAR(10) NOT NULL DEFAULT 'movie'"),
        ("tv_series_id", "VARCHAR(50)"),
        ("season_number", "INTEGER"),
        ("episode_count", "INTEGER"),
        ("series_poster_url", "VARCHAR(500)"),
    ])


def _run_per_user_column_migrations(user_id: int):
    """Run column-level schema migrations for a per-user database."""
    from sqlalchemy import inspect

    engine = get_user_engine(user_id)
    inspector = inspect(engine)

    try:
        columns = [c["name"] for c in inspector.get_columns("media_items")]
    except Exception:
        return

    if "session_id" in columns:
        _drop_column_if_exists("media_items", "session_id", engine=engine)

    # Drop director / actors columns (no longer scraped)
    if "director" in columns:
        _drop_column_if_exists("media_items", "director", engine=engine)
    if "actors" in columns:
        _drop_column_if_exists("media_items", "actors", engine=engine)

    try:
        log_columns = [c["name"] for c in inspector.get_columns("operation_logs")]
    except Exception:
        log_columns = []
    _add_columns_if_missing("operation_logs", log_columns, [
        ("user_id", "INTEGER NOT NULL REFERENCES users(id)"),
        ("username", "VARCHAR(64) NOT NULL"),
        ("action", "VARCHAR(64) NOT NULL"),
        ("detail", "VARCHAR(500)"),
    ], engine=engine)

    # ── Migration: recommendations.tmdb_id ──
    try:
        rec_columns = [c["name"] for c in inspector.get_columns("recommendations")]
    except Exception:
        rec_columns = []
    _add_columns_if_missing("recommendations", rec_columns, [
        ("tmdb_id", "VARCHAR(50)"),
    ], engine=engine)

    # ── Migration: media_servers table ──
    try:
        existing_tables = inspector.get_table_names()
    except Exception:
        existing_tables = []
    if "media_servers" not in existing_tables:
        _create_media_servers_table(engine, user_id)

    # ── Data migration: ensure items with sort_order are marked as pinned ──
    _fix_top_rated_pins(user_id, engine)


def _fix_top_rated_pins(user_id: int, engine=None):
    """One-time data migration: mark items with sort_order as pinned.

    Before the `pinned` field was introduced, items were tracked solely
    by having a non-null `sort_order`. After adding `pinned`, we need to
    ensure all existing items with `sort_order` set also have `pinned=True`
    so they continue to appear in get_top_rated (which now only checks
    `pinned == True` instead of the old `pinned OR sort_order` condition).
    """
    from models import MediaItemRecord

    target = engine or master_engine
    try:
        with Session(target) as session:
            fixed = session.exec(
                select(MediaItemRecord).where(
                    MediaItemRecord.sort_order.isnot(None),
                    MediaItemRecord.pinned == False,
                )
            ).all()
            if fixed:
                for r in fixed:
                    r.pinned = True
                session.commit()
                logger.info(f"  [Migration] Fixed {len(fixed)} top-rated item(s) for user id={user_id} (set pinned=True)")
    except Exception as e:
        logger.warning(f"  [Migration] Error fixing top-rated pins for user id={user_id}: {e}")

def _add_columns_if_missing(table: str, existing_columns: list[str], columns: list[tuple[str, str]], engine=None):
    """Add each column if it doesn't already exist.

    Safely handles the case where ``SQLModel.metadata.create_all()`` has
    already created the column (e.g. when a model's field is added and
    the table is freshly created).  The explicit ``ALTER TABLE`` would
    fail with "duplicate column name" on SQLite, which is caught and
    silently ignored here.
    """
    from sqlalchemy import text
    from sqlalchemy.exc import OperationalError

    target = engine or master_engine
    db_label = "per-user DB" if engine else "master DB"
    with target.connect() as conn:
        for col_name, col_def in columns:
            if col_name not in existing_columns:
                try:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"))
                    conn.commit()
                    print(f"  [Migration] Added '{col_name}' column to {table} table ({db_label})")
                except OperationalError as e:
                    # "duplicate column name" on SQLite — column was already
                    # created by SQLModel.metadata.create_all().  Silently skip.
                    if "duplicate column" in str(e).lower():
                        conn.rollback()
                    else:
                        raise


def _create_media_servers_table(engine, user_id: int):
    """Create the media_servers table for a per-user database."""
    from sqlalchemy import text
    
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS media_servers (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    name VARCHAR(128) NOT NULL,
                    server_type VARCHAR(32) NOT NULL,
                    host VARCHAR(255) NOT NULL,
                    port INTEGER NOT NULL DEFAULT 8096,
                    api_key VARCHAR(512) NOT NULL,
                    use_ssl BOOLEAN NOT NULL DEFAULT 0,
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    last_connected TIMESTAMP,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.commit()
            logger.info(f"  [Migration] Created media_servers table for user id={user_id}")
    except Exception as e:
        logger.warning(f"  [Migration] Error creating media_servers table for user id={user_id}: {e}")


def _drop_column_if_exists(table: str, column: str, engine=None):
    """Drop a column from a table if it exists.

    Accepts an optional ``engine`` parameter; defaults to ``master_engine``.
    Unlike ``ALTER TABLE ... DROP COLUMN IF EXISTS`` (which requires
    SQLite ≥ 3.35.0), this uses a try/except approach for broader
    compatibility.
    """
    from sqlalchemy import text
    from sqlalchemy.exc import OperationalError

    target = engine or master_engine
    db_label = "per-user DB" if engine else "master DB"

    with target.connect() as conn:
        try:
            conn.execute(text(f"ALTER TABLE {table} DROP COLUMN {column}"))
            conn.commit()
            print(f"  [Migration] Dropped '{column}' column from {table} table ({db_label})")
        except OperationalError as e:
            err_msg = str(e).lower()
            # "no such column" — column already gone from a previous run
            if "no such column" in err_msg:
                conn.rollback()
            else:
                raise


