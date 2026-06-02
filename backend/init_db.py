#!/usr/bin/env python3
"""
PostgreSQL Database Initializer
================================
Creates all tables and seeds the default admin user.
Reads DATABASE_URL from .env or environment variable.

Usage:
    python init_db.py              # reads from .env
    python init_db.py --force       # drops tables first
"""

import os
import sys
import argparse
from pathlib import Path

# Ensure backend directory is in the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


# ── Helpers ─────────────────────────────────────────────────────────


def _mask_password(url: str) -> str:
    """Mask the password portion of a PostgreSQL URL for safe logging."""
    if "@" not in url:
        return url
    userinfo, rest = url.split("@", 1)
    if ":" not in userinfo:
        return url
    username, _ = userinfo.split(":", 1)
    return f"{username}:******@{rest}"


# ── Main ────────────────────────────────────────────────────────────


def main():
    # ── Load .env from project root ─────────────────────────────────

    from dotenv import load_dotenv

    project_root = Path(__file__).resolve().parent.parent
    dotenv_path = project_root / ".env"

    if dotenv_path.exists():
        load_dotenv(dotenv_path, override=False)
        print(f"Loaded: {dotenv_path}")
    else:
        print(f"NOTE: {dotenv_path} not found, falling back to environment variables.")

    # ── Parse args ──────────────────────────────────────────────────

    parser = argparse.ArgumentParser(description="Initialize PostgreSQL database")
    parser.add_argument(
        "--force", action="store_true",
        help="Drop all existing tables before creating them (irreversible!)",
    )
    args = parser.parse_args()

    # ── Validate DATABASE_URL ───────────────────────────────────────

    pg_url = os.getenv("DATABASE_URL", "")
    if not pg_url or not pg_url.startswith("postgresql"):
        print("ERROR: DATABASE_URL must be set to a PostgreSQL connection string.")
        print()
        print("  Configure it in .env or pass as environment variable:")
        print("    .env:        DATABASE_URL=postgresql://...")
        print("    env var:     DATABASE_URL=postgresql://... python init_db.py")
        print()
        sys.exit(1)

    # ── Build engine ────────────────────────────────────────────────

    from sqlalchemy import text
    from sqlmodel import SQLModel

    from engine import build_engine

    engine = build_engine(pg_url, pool_pre_ping=True)

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            conn.commit()
    except Exception as e:
        print(f"ERROR: Could not connect to PostgreSQL: {e}")
        sys.exit(1)

    safe_url = _mask_password(pg_url)
    print(f"Connected: {safe_url}")

    # ── Register models & create tables ─────────────────────────────

    import models  # noqa: F401 — register all table models with SQLModel.metadata

    if args.force:
        print("Dropping all existing tables...")
        SQLModel.metadata.drop_all(engine)
        print("Done.")

    print("Creating tables...")
    SQLModel.metadata.create_all(engine)
    print("Tables created.")

    # ── Seed default admin user ─────────────────────────────────────

    from datetime import datetime
    from passlib.hash import bcrypt
    from sqlmodel import Session, select
    from models import UserRecord

    with Session(engine) as db:
        existing = db.exec(
            select(UserRecord).where(UserRecord.username == "admin")
        ).first()

        if existing:
            print(f"Admin user already exists (id={existing.id}), skipping seed.")
        else:
            admin = UserRecord(
                username="admin",
                password_hash=bcrypt.hash("admin123"),
                is_admin=True,
                created_at=datetime.utcnow(),
            )
            db.add(admin)
            db.commit()
            print("Default admin user created: admin / admin123")

    # ── Done ────────────────────────────────────────────────────────

    engine.dispose()

    print()
    print("Database initialized successfully!")
    print("  Login: admin / admin123")


if __name__ == "__main__":
    main()

