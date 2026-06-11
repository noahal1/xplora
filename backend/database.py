"""Database setup using SQLModel engine and session factory.

Supports PostgreSQL (via pg8000 driver) and SQLite.

Set the DATABASE_URL environment variable, e.g.:
    PostgreSQL:  postgresql://user:password@localhost:5432/xplora
    SQLite:      sqlite:///data/xplora.db

Connection pool settings (PostgreSQL only, configurable via env vars):
  DB_POOL_SIZE       — base pool connections (default: 10)
  DB_MAX_OVERFLOW    — additional connections beyond pool_size (default: 20)
  DB_POOL_TIMEOUT    — seconds to wait for a connection (default: 30)
  DB_POOL_RECYCLE    — seconds after which to recycle a connection (default: 1800)
  DB_POOL_PRE_PING   — whether to verify connections before use (default: true)
"""

import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from passlib.hash import bcrypt
from sqlalchemy import event as sa_event
from sqlmodel import Session, SQLModel, select

from engine import build_engine
from models import UserRecord


def _is_sqlite(url: str) -> bool:
    """Check whether the DATABASE_URL points to a SQLite database."""
    return url.startswith("sqlite://") or url.startswith("sqlite+")


# ---- Helper: safe integer parsing ----


def _safe_int(value: str | None, default: int) -> int:
    """Parse an integer from an env var value; return ``default`` on failure."""
    if value is None or value.strip() == "":
        return default
    try:
        return int(value.strip())
    except (ValueError, TypeError):
        return default


# ---- Database URL ----


load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Xplora requires a connection string, e.g.\n"
        "  PostgreSQL:  DATABASE_URL=postgresql://user:password@localhost:5432/xplora\n"
        "  SQLite:      DATABASE_URL=sqlite:///data/xplora.db"
    )

if not (DATABASE_URL.startswith("postgresql") or _is_sqlite(DATABASE_URL)):
    raise RuntimeError(
        "DATABASE_URL must start with 'postgresql://' or 'sqlite:///', got:\n"
        f"  {DATABASE_URL}"
    )

# ---- Engine ----


def _ensure_sqlite_dir(url: str):
    """Create the parent directory for a SQLite database file if it doesn't exist."""
    # sqlite:///path/to/db.db  →  /path/to/
    file_path = url.removeprefix("sqlite://")
    if file_path:
        db_dir = os.path.dirname(file_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)


if _is_sqlite(DATABASE_URL):
    _ensure_sqlite_dir(DATABASE_URL)

    # SQLite: no connection pool, no thread check
    engine = build_engine(
        DATABASE_URL,
        echo=False,
        connect_args={"check_same_thread": False},
    )

    # Enable WAL mode and foreign keys on every new connection
    @sa_event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
else:
    # PostgreSQL: connection pool with configurable settings
    pool_size = _safe_int(os.getenv("DB_POOL_SIZE"), 10)
    max_overflow = _safe_int(os.getenv("DB_MAX_OVERFLOW"), 20)
    pool_timeout = _safe_int(os.getenv("DB_POOL_TIMEOUT"), 30)
    pool_recycle = _safe_int(os.getenv("DB_POOL_RECYCLE"), 1800)
    pool_pre_ping = os.getenv("DB_POOL_PRE_PING", "true").lower() in ("true", "1", "yes")

    engine = build_engine(
        DATABASE_URL,
        echo=False,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_timeout=pool_timeout,
        pool_recycle=pool_recycle,
        pool_pre_ping=pool_pre_ping,
        connect_args={"timeout": 5},
    )


# ---- Init / Migrations ----


def init_db():
    """Create all tables if they don't exist, run migrations, and seed default admin user."""
    import models  # noqa: F401

    from sqlalchemy import inspect as _inspect
    _rename_table_if_needed(_inspect(engine))

    SQLModel.metadata.create_all(engine)

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
    finally:
        db.close()


def _run_column_migrations():
    """Run column-level schema migrations for existing databases.

    For SQLite: columns are created fresh by ``create_all()``, so this is
    a no-op (SQLite ALTER TABLE is very limited).  For PostgreSQL: runs
    ``ALTER TABLE`` for each missing column.
    """
    from sqlalchemy import inspect, text

    if _is_sqlite(DATABASE_URL):
        # SQLite creates all columns via create_all() — no ALTER needed
        return

    inspector = inspect(engine)
    _rename_table_if_needed(inspector)

    try:
        columns = [c["name"] for c in inspector.get_columns("media_items")]
    except Exception:
        return

    _add_columns_if_missing("media_items", columns, [
        ("status", "VARCHAR(20) NOT NULL DEFAULT 'watched'"),
        ("notes", "VARCHAR(500)"),
        ("poster_url", "VARCHAR(500)"),
        ("overview", "TEXT"),
        ("director", "VARCHAR(255)"),
        ("actors", "VARCHAR(500)"),
        ("runtime", "INTEGER"),
        ("imdb_id", "VARCHAR(50)"),
        ("tmdb_id", "VARCHAR(50)"),
        ("country", "VARCHAR(100)"),
        ("awards", "VARCHAR(500)"),
        ("tagline", "VARCHAR(500)"),
        ("scrape_error", "TEXT"),
        ("media_type", "VARCHAR(10) NOT NULL DEFAULT 'movie'"),
        ("tv_series_id", "VARCHAR(50)"),
        ("season_number", "INTEGER"),
        ("episode_count", "INTEGER"),
        ("series_poster_url", "VARCHAR(500)"),
    ])

    # Remove unused session_id column from media_items
    if "session_id" in columns:
        _drop_column_if_exists("media_items", "session_id")

    # Operation logs table
    try:
        log_columns = [c["name"] for c in inspector.get_columns("operation_logs")]
    except Exception:
        log_columns = []
    _add_columns_if_missing("operation_logs", log_columns, [
        ("user_id", "INTEGER NOT NULL REFERENCES users(id)"),
        ("username", "VARCHAR(64) NOT NULL"),
        ("action", "VARCHAR(64) NOT NULL"),
        ("detail", "VARCHAR(500)"),
    ])


def _rename_table_if_needed(inspector):
    """Rename the old ``movies`` table to ``media_items`` if it still exists.

    Works on both PostgreSQL and SQLite (both support ``ALTER TABLE ... RENAME``).
    """
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
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {old_table} RENAME TO {new_table}"))
            conn.commit()
            print(f"  [Migration] Renamed table '{old_table}' → '{new_table}'")
        return

    if has_old and has_new:
        with engine.connect() as conn:
            row = conn.execute(text(f"SELECT COUNT(*) FROM {new_table}")).scalar()
            count = row or 0
        if count == 0:
            with engine.connect() as conn:
                conn.execute(text(f"DROP TABLE {new_table}"))
                conn.execute(text(f"ALTER TABLE {old_table} RENAME TO {new_table}"))
                conn.commit()
            print(f"  [Migration] Dropped empty '{new_table}', renamed '{old_table}' → '{new_table}'")
        else:
            with engine.connect() as conn:
                conn.execute(text(f"DROP TABLE {old_table}"))
                conn.commit()
            print(f"  [Migration] Dropped orphaned '{old_table}' — data already in '{new_table}' ({count} rows)")


def _add_columns_if_missing(table: str, existing_columns: list[str], columns: list[tuple[str, str]]):
    """Add each column if it doesn't already exist.

    PostgreSQL only — SQLite handles columns via ``create_all()``.
    """
    from sqlalchemy import text

    with engine.connect() as conn:
        for col_name, col_def in columns:
            if col_name not in existing_columns:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"))
                conn.commit()
                print(f"  [Migration] Added '{col_name}' column to {table} table")


def _drop_column_if_exists(table: str, column: str):
    """Drop a column from a table if it exists.

    PostgreSQL requires the FK constraint to be dropped first.  SQLite
    3.35+ supports ``DROP COLUMN``, but this function is only called for
    PostgreSQL (SQLite skips column migrations).
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    fks = inspector.get_foreign_keys(table)
    fk_name = None
    for fk in fks:
        if column in fk.get("constrained_columns", []):
            fk_name = fk.get("name")
            break

    with engine.connect() as conn:
        if fk_name:
            conn.execute(text(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {fk_name}"))
            conn.commit()
        conn.execute(text(f"ALTER TABLE {table} DROP COLUMN IF EXISTS {column}"))
        conn.commit()
        print(f"  [Migration] Dropped '{column}' column from {table} table")


# ---- Session helpers ----


def get_session() -> Session:
    """Get a new SQLModel session."""
    return Session(engine)


def get_db():
    """FastAPI dependency that yields a request-scoped SQLModel session.

    Use in route handlers via ``db: Session = Depends(get_db)``.
    The session is automatically closed when the request finishes.

    Example:
        .. code-block:: python

            @router.get(\"/items\")
            async def list_items(db: Session = Depends(get_db)):
                return db.exec(select(Item)).all()
    """
    db = Session(engine)
    try:
        yield db
    finally:
        db.close()
