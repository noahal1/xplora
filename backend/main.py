"""FastAPI movie recommendation service — app factory, lifespan, and static serving."""

import logging
import os

from dotenv import load_dotenv

# Configure logging so background tasks (scraper, etc.) are visible
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from database import init_db
from config_manager import get_all_status as get_config_status
from poster_cache import ensure_poster_dir, get_poster_dir

load_dotenv()


# ── Lifespan ────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("=" * 50)
    print("  Movie Recommender API starting...")
    print("=" * 50)

    init_db()
    from database import DATABASE_URL
    print(f"  Database: PostgreSQL — {DATABASE_URL}")

    deepseek_key = os.getenv("DEEPSEEK_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    print(f"  DeepSeek API: {'[configured]' if deepseek_key else '[NOT set]'}")
    print(f"  OpenAI API:   {'[configured]' if openai_key else '[NOT set]'}")

    if not deepseek_key and not openai_key:
        print()
        print("  [WARNING] No API keys found!")
        print("  Please create a .env file from .env.example:")
        print("  Copy .env.example to .env and add your API keys")
        print()

    # Ensure poster cache directory exists
    try:
        poster_dir = ensure_poster_dir()
        print(f"  Poster cache: {poster_dir}")
    except Exception as e:
        print(f"  Poster cache: failed to create directory — {e}")

    print("=" * 50)
    yield
    print("Shutting down...")


# ── App setup ───────────────────────────────────────────────────────


app = FastAPI(
    title="Xplore Movie Recommender",
    description="Multi-user movie recommendation service with JWT auth",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Mount routers ───────────────────────────────────────────────────


from routers.auth import router as auth_router
from routers.movies import router as movies_router
from routers.recommend import router as recommend_router
from routers.sessions import router as sessions_router
from routers.admin import router as admin_router
from routers.user_data import router as user_data_router

app.include_router(auth_router)
app.include_router(movies_router)
app.include_router(recommend_router)
app.include_router(sessions_router)
app.include_router(admin_router)
app.include_router(user_data_router)


# ── Health check ────────────────────────────────────────────────────


@app.get("/api/health")
async def health_check():
    """Health check endpoint with API key status and system info."""
    from database import engine as db_engine
    from sqlalchemy import inspect

    db_ok = True
    db_info = "postgresql"
    try:
        inspector = inspect(db_engine)
        inspector.get_table_names()
    except Exception:
        db_ok = False

    return {
        "status": "ok",
        "version": "2.0.0",
        "database": db_info if db_ok else "error",
        "database_status": "ok" if db_ok else "error",
        "api_keys": get_config_status(),
    }


# ── Poster static serving (BEFORE the SPA catch-all) ───────────────
# Mounted sub-applications take priority over route handlers in
# Starlette/FastAPI, so this will intercept /static/posters/* before
# the SPA catch-all route below.
#
# NOTE: We create the directory immediately at module level rather
# than relying on the lifespan, because the lifespan hasn't run yet
# when this module-level code executes. If creation fails (e.g.
# read-only filesystem), we skip the mount gracefully.

_poster_dir = get_poster_dir()
try:
    os.makedirs(_poster_dir, exist_ok=True)
    app.mount("/static/posters", StaticFiles(directory=_poster_dir), name="posters")
    print(f"  Poster cache: {_poster_dir}")
except Exception as e:
    print(f"  [WARNING] Cannot create poster cache directory '{_poster_dir}': {e}")
    print(f"  [WARNING] Posters will be served from TMDB CDN")


# ── Frontend SPA serving ────────────────────────────────────────────


frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    """Serve built frontend as SPA — all unmatched paths serve index.html."""
    if not os.path.isdir(frontend_dist):
        raise HTTPException(status_code=404, detail="Frontend not built")
    file_path = os.path.join(frontend_dist, full_path)
    # Security: prevent path traversal
    real_path = os.path.realpath(file_path)
    real_dist = os.path.realpath(frontend_dist)
    if not real_path.startswith(real_dist):
        raise HTTPException(status_code=403)
    if os.path.isfile(real_path):
        return FileResponse(real_path)
    # SPA fallback: serve index.html for all unmatched GET paths
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path, media_type="text/html")
    raise HTTPException(status_code=404, detail="Not found")
