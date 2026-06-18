import os

from sqlalchemy import Engine
from sqlmodel import create_engine


def build_engine(url: str | None = None, **kwargs) -> Engine:
    resolved = url or os.getenv("DATABASE_URL", "")

    if not resolved:
        raise ValueError(
            "DATABASE_URL is not set — pass a url or set the DATABASE_URL env var"
        )
    if resolved.startswith("postgresql://") and "+" not in resolved:
        resolved = resolved.replace("postgresql://", "postgresql+pg8000://", 1)

    return create_engine(resolved, **kwargs)
