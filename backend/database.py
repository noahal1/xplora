"""Database setup using SQLModel engine and session factory.

PostgreSQL only — set the DATABASE_URL environment variable, e.g.:
    postgresql://user:password@localhost:5432/xplore

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
        "DATABASE_URL is not set. Xplore requires a PostgreSQL connection string, e.g.\n"
        "  DATABASE_URL=postgresql://user:password@localhost:5432/xplore"
    )

if not DATABASE_URL.startswith("postgresql"):
    raise RuntimeError(
        "DATABASE_URL must be a PostgreSQL connection string, e.g.\n"
        "  DATABASE_URL=postgresql://user:password@localhost:5432/xplore"
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
)


def init_db():
    """Create all tables if they don't exist, run migrations, and seed default admin user."""
    # Import all table models so they register with SQLModel.metadata
    import models  # noqa: F401

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
    try:
        columns = [c["name"] for c in inspector.get_columns("movies")]
    except Exception:
        # Table may not exist yet (fresh DB), skip
        return

    # PostgreSQL requires a separate ALTER TABLE per column
    _add_columns_if_missing("movies", columns, [
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
    ])


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


def get_session() -> Session:
    """Get a new SQLModel session."""
    return Session(engine)
