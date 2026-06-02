#!/usr/bin/env python3
"""Test pg8000 (pure-Python PostgreSQL driver) with SSL support."""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import ssl

# Load .env
project_root = Path(__file__).resolve().parent.parent
dotenv_path = project_root / ".env"
if dotenv_path.exists():
    load_dotenv(dotenv_path, override=False)
    print(f"Loaded: {dotenv_path}")

pg_url = os.getenv("DATABASE_URL", "")

# Mask password for display
safe_url = pg_url
if "@" in pg_url:
    user_part = pg_url.split("@")[0]
    if ":" in user_part:
        parts = user_part.split(":")
        safe_url = f"{parts[0]}:******@{pg_url.split('@')[1]}"
print(f"DATABASE_URL: {safe_url}")

from sqlmodel import create_engine
from sqlalchemy import text

# Try with SSL context
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Convert to pg8000 URL with SSL
engine_url = pg_url.replace("postgresql://", "postgresql+pg8000://", 1)
print(f"Engine URL scheme: {engine_url.split(':')[0]}")

try:
    engine = create_engine(engine_url, pool_pre_ping=True,
                           connect_args={"ssl_context": ctx})
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        print(f"SUCCESS: {result.fetchone()}")
    engine.dispose()
except Exception as e:
    import traceback
    print(f"FAILED with SSL:")
    traceback.print_exc()
    
    # Try without SSL
    print("\n--- Trying without SSL ---")
    try:
        engine = create_engine(engine_url, pool_pre_ping=True)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            print(f"SUCCESS: {result.fetchone()}")
        engine.dispose()
    except Exception as e2:
        print(f"FAILED without SSL:")
        traceback.print_exc()
        sys.exit(1)
