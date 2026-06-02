"""Shared engine builder — single source of truth for SQLModel engine creation.

Usage:
    from engine import build_engine
    engine = build_engine()
    engine = build_engine("postgresql://user:pass@host:5432/db")
    engine = build_engine(pool_size=5, max_overflow=10)
"""

import os

from sqlalchemy import Engine
from sqlmodel import create_engine


def build_engine(url: str | None = None, **kwargs) -> Engine:
    """Build a SQLModel engine with pg8000 driver support for PostgreSQL.

    Auto-converts ``postgresql://`` to ``postgresql+pg8000://`` to use the
    pure-Python pg8000 driver, avoiding UnicodeDecodeError on Windows with
    Chinese locale (cp936/GBK).

    Args:
        url: PostgreSQL connection string.  Falls back to ``DATABASE_URL`` env var.
        **kwargs: Forwarded to ``create_engine()`` (e.g. ``pool_size``,
            ``connect_args``).

    Returns:
        A configured SQLAlchemy/SQLModel engine.
    """
    resolved = url or os.getenv("DATABASE_URL", "")

    if not resolved:
        raise ValueError(
            "DATABASE_URL is not set — pass a url or set the DATABASE_URL env var"
        )

    # If it's a plain postgresql:// URL (no driver suffix), add pg8000
    if resolved.startswith("postgresql://") and "+" not in resolved:
        resolved = resolved.replace("postgresql://", "postgresql+pg8000://", 1)

    return create_engine(resolved, **kwargs)
