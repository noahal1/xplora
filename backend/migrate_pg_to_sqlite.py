#!/usr/bin/env python3
"""
Migrate existing PostgreSQL data to SQLite.

Usage:
    1. Make sure PostgreSQL is running and accessible
    2. Set the old PG DATABASE_URL in your environment, or pass it as --pg-url

    # Quick mode (reads PG URL from env or docker-compose):
    python backend/migrate_pg_to_sqlite.py

    # Explicit URLs:
    python backend/migrate_pg_to_sqlite.py \\
        --pg-url postgresql://xplora:xplora_pg_pass@localhost:5432/xplora \\
        --sqlite-path /tmp/xplora.db
"""

import argparse
import os
import sys

# ── Allow running as script (add parent dir to path) ──────────────
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import create_engine, MetaData, Table, text as sa_text


# ── Table order matters (FK dependencies) ─────────────────────────
TABLES_IN_ORDER = [
    "users",
    "media_items",
    "sessions",
    "recommendations",
    "operation_logs",
]


def get_pg_engine(pg_url: str):
    """Resolve PG URL (add pg8000 driver if needed) and return engine."""
    url = pg_url.strip()
    if url.startswith("postgresql://") and "+" not in url:
        url = url.replace("postgresql://", "postgresql+pg8000://", 1)
    engine = create_engine(url, echo=False)
    # Quick connectivity check
    with engine.connect() as conn:
        conn.execute(sa_text("SELECT 1"))
    print(f"  ✓ Connected to PostgreSQL: {pg_url.split('@')[-1]}")
    return engine


def get_sqlite_engine(sqlite_path: str):
    """Create SQLite engine, ensure parent directory exists."""
    os.makedirs(os.path.dirname(sqlite_path) or ".", exist_ok=True)
    # Use 4 slashes for absolute paths (SQLAlchemy 2.x compatibility)
    prefix = "sqlite:////" if sqlite_path.startswith("/") else "sqlite:///"
    engine = create_engine(
        f"{prefix}{sqlite_path}",
        echo=False,
        connect_args={"check_same_thread": False},
    )
    # Enable WAL + foreign keys
    with engine.connect() as conn:
        conn.execute(sa_text("PRAGMA journal_mode=WAL"))
        conn.execute(sa_text("PRAGMA foreign_keys=ON"))
    print(f"  ✓ SQLite target: {sqlite_path}")
    return engine


def copy_table(pg_engine, sqlite_engine, table_name: str):
    """Read all rows from PG table and insert into SQLite."""
    pg_meta = MetaData()
    pg_table = Table(table_name, pg_meta, autoload_with=pg_engine)

    sqlite_meta = MetaData()
    sqlite_table = Table(table_name, sqlite_meta, autoload_with=sqlite_engine)

    with pg_engine.connect() as pg_conn:
        rows = pg_conn.execute(pg_table.select()).fetchall()

    if not rows:
        print(f"  • {table_name}: 0 rows (empty)")
        return

    # Convert Row objects to dicts
    # Keep datetime objects as-is — SQLAlchemy's SQLite dialect handles serialization
    columns = [c.name for c in pg_table.columns]
    dict_rows = [{col: getattr(row, col) for col in columns} for row in rows]

    with sqlite_engine.begin() as conn:
        conn.execute(sqlite_table.insert(), dict_rows)

    print(f"  • {table_name}: {len(rows)} rows → migrated")


def ensure_sqlite_schema(sqlite_engine):
    """Create all tables in SQLite using SQLModel metadata."""
    from sqlmodel import SQLModel
    import models  # noqa: F401 — registers tables with metadata

    SQLModel.metadata.create_all(sqlite_engine)
    print("  ✓ SQLite schema created")


def migrate(pg_url: str, sqlite_path: str):
    """Main migration orchestrator."""
    print("=" * 50)
    print("  PostgreSQL → SQLite Migration")
    print("=" * 50)

    pg_engine = get_pg_engine(pg_url)
    sqlite_engine = get_sqlite_engine(sqlite_path)

    # Remove old SQLite file if it exists (clean slate for re-runs)
    if os.path.exists(sqlite_path):
        os.remove(sqlite_path)
        print(f"  ✓ Removed old SQLite file")

    print("\n── Creating SQLite schema ──")
    ensure_sqlite_schema(sqlite_engine)

    print("\n── Copying data ──")
    for table in TABLES_IN_ORDER:
        copy_table(pg_engine, sqlite_engine, table)

    print("\n── Verifying ──")
    with sqlite_engine.connect() as conn:
        for table in TABLES_IN_ORDER:
            count = conn.execute(sa_text(f"SELECT COUNT(*) FROM {table}")).scalar()
            print(f"  ✓ {table}: {count} rows")

    print("\n" + "=" * 50)
    print("  Migration complete!")
    print(f"  SQLite file: {sqlite_path}")
    print("=" * 50)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Migrate PostgreSQL data to SQLite for Xplora"
    )
    parser.add_argument(
        "--pg-url",
        default=None,
        help="PostgreSQL connection string (default: DATABASE_URL env var)",
    )
    parser.add_argument(
        "--sqlite-path",
        default="/tmp/xplora.db",
        help="Target SQLite file path (default: /tmp/xplora.db)",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    pg_url = args.pg_url or os.getenv("DATABASE_URL", "")
    if not pg_url:
        print("ERROR: Provide --pg-url or set DATABASE_URL environment variable")
        sys.exit(1)
    if not pg_url.startswith("postgresql"):
        print(f"ERROR: Not a PostgreSQL URL: {pg_url[:30]}...")
        sys.exit(1)
    migrate(pg_url, args.sqlite_path)
