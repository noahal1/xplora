"""Database setup using SQLModel engine and session factory.

PostgreSQL only — set the DATABASE_URL environment variable, e.g.:
    postgresql://user:password@localhost:5432/xplora

Connection pool settings (configurable via env vars):
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
from sqlmodel import Session, SQLModel, select

from engine import build_engine
from models import UserRecord


# ---- Helper: safe integer parsing ----

def _safe_int(value: str | None, default: int) -> int:
    """Parse an integer from an env var value; return `default` on failure or empty."""
    if value is None or value.strip() == "":
        return default
    try:
        return int(value.strip())
    except (ValueError, TypeError):
        return default


# ---- Database URL ----

# Load .env from the project root before reading config, so DATABASE_URL is
# picked up regardless of import order or working directory (main.py imports
# this module before it calls load_dotenv itself). Existing OS env vars (e.g.
# the ones docker-compose injects) are NOT overridden.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Xplora requires a PostgreSQL connection string, e.g.\n"
        "  DATABASE_URL=postgresql://user:password@localhost:5432/xplora"
    )

if not DATABASE_URL.startswith("postgresql"):
    raise RuntimeError(
        "DATABASE_URL must be a PostgreSQL connection string, e.g.\n"
        "  DATABASE_URL=postgresql://user:password@localhost:5432/xplora"
    )

# ---- Engine (PostgreSQL connection pool) ----

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


def init_db():
    """Create all tables if they don't exist, run migrations, and seed default admin user."""
    # Import all table models so they register with SQLModel.metadata
    import models  # noqa: F401

    # IMPORTANT: Rename old `movies` table BEFORE `create_all`, otherwise
    # SQLModel will see `media_items` doesn't exist yet and create a new
    # empty table, leaving all existing data orphaned in the old `movies`
    # table.
    from sqlalchemy import inspect as _inspect
    _rename_table_if_needed(_inspect(engine))

    SQLModel.metadata.create_all(engine)

    # Run column-level migrations
    _run_migrations()

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


def _run_migrations():
    """Run schema migrations for existing databases."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)

    # ── Step 1: Rename old `movies` table to `media_items` ──────
    _rename_table_if_needed(inspector)

    try:
        columns = [c["name"] for c in inspector.get_columns("media_items")]
    except Exception:
        # Table may not exist yet (fresh DB), skip
        return

    # PostgreSQL requires a separate ALTER TABLE per column
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

    # ── Step 2: Remove unused `session_id` column from media_items ──
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
    """Rename the old `movies` table to `media_items` if it still exists.

    Handles three scenarios:
    1. Only `movies` exists → simple rename.
    2. Both `movies` and `media_items` exist, `media_items` empty →
       drop empty `media_items`, then rename.
    3. Both exist, `media_items` has data → `movies` is orphaned,
       drop it (data already in `media_items`).

    PostgreSQL automatically updates all foreign key constraints that
    reference the renamed table, so no additional ALTER statements are
    needed for FK columns in `users` / `sessions`.
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
        return  # Nothing to migrate

    if has_old and not has_new:
        # Clean rename — no table collision
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {old_table} RENAME TO {new_table}"))
            conn.commit()
            print(f"  [Migration] Renamed table '{old_table}' → '{new_table}'")
        return

    if has_old and has_new:
        # Both tables exist — check if media_items has data
        with engine.connect() as conn:
            row = conn.execute(text(f"SELECT COUNT(*) FROM {new_table}")).scalar()
            count = row or 0

        if count == 0:
            # media_items is empty (created by create_all before the
            # rename migration existed). Drop it and rename movies.
            with engine.connect() as conn:
                conn.execute(text(f"DROP TABLE {new_table}"))
                conn.execute(text(f"ALTER TABLE {old_table} RENAME TO {new_table}"))
                conn.commit()
            print(f"  [Migration] Dropped empty '{new_table}', renamed '{old_table}' → '{new_table}' with {count} rows")
        else:
            # media_items already has data — movies is orphaned, drop it
            with engine.connect() as conn:
                conn.execute(text(f"DROP TABLE {old_table}"))
                conn.commit()
            print(f"  [Migration] Dropped orphaned '{old_table}' — data already in '{new_table}' ({count} rows)")


def _add_columns_if_missing(table: str, existing_columns: list[str], columns: list[tuple[str, str]]):
    """Add each column if it doesn't already exist."""
    from sqlalchemy import text

    with engine.connect() as conn:
        for col_name, col_def in columns:
            if col_name not in existing_columns:
                conn.execute(text(
                    f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"
                ))
                conn.commit()
                print(f"  [Migration] Added '{col_name}' column to {table} table")


def _drop_column_if_exists(table: str, column: str):
    """Drop a column from a table if it exists.

    PostgreSQL requires the FK constraint to be dropped first (by name),
    then the column can be dropped.
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


def get_session() -> Session:
    """Get a new SQLModel session."""
    return Session(engine)


def get_db():
    """FastAPI dependency that yields a request-scoped SQLModel session.

    Use in route handlers via ``db: Session = Depends(get_db)``.
    The session is automatically closed when the request finishes.

    Example:
        .. code-block:: python

            @router.get("/items")
            async def list_items(db: Session = Depends(get_db)):
                return db.exec(select(Item)).all()
    """
    db = Session(engine)
    try:
        yield db
    finally:
        db.close()
