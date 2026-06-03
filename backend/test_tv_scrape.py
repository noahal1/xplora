"""
Quick smoke-test for TV series scraping support.

Tests:
1. TMDB TV search (dual-language) via search_tmdb_tv_dual()
2. TMDB TV detail fetch via _get_tmdb_tv_detail()
3. Full scrape_movie_metadata() with a TV series title
4. OMDb series search via search_omdb(media_type="series")
"""

import json
import logging
import sys
import os

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("test_tv")

# Ensure we can import from the backend package
sys.path.insert(0, os.path.dirname(__file__))

from config_manager import get_api_key
from movie_search import search_tmdb_tv_dual, search_omdb, get_movie_detail
from scraper.search import scrape_movie_metadata, search_tmdb, search_tmdb_tv

tmdb_key = get_api_key("tmdb")
omdb_key = get_api_key("omdb")


def heading(label: str):
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"{'='*60}")


# ── Test 1: TMDB TV search ─────────────────────────────────────
heading("Test 1: TMDB TV search — Breaking Bad")
if tmdb_key:
    results = search_tmdb_tv_dual("Breaking Bad", tmdb_key)
    print(f"  Results: {len(results)}")
    for r in results[:3]:
        print(f"    - {r.title} ({r.year}) [TMDB:{r.source_id}] media_type={r.media_type}")
        print(f"      original_title={r.original_title}, genre={r.genre}")
else:
    print("  [SKIP] TMDB key not configured")


# ── Test 2: TMDB TV search with Chinese title ───────────────────
heading("Test 2: TMDB TV search — 权力的游戏 (Game of Thrones)")
if tmdb_key:
    results = search_tmdb_tv_dual("权力的游戏", tmdb_key)
    print(f"  Results: {len(results)}")
    for r in results[:3]:
        print(f"    - {r.title} ({r.year}) [TMDB:{r.source_id}] media_type={r.media_type}")
        print(f"      original_title={r.original_title}, genre={r.genre}")
else:
    print("  [SKIP] TMDB key not configured")


# ── Test 3: TMDB TV detail fetch ────────────────────────────────
heading("Test 3: TMDB TV detail — Breaking Bad (ID=1396)")
if tmdb_key:
    try:
        detail = get_movie_detail("tmdb", "1396", media_type="tv")
        print(f"  Title: {detail.get('title')}")
        print(f"  Year: {detail.get('year')}")
        print(f"  Genre: {detail.get('genre')}")
        print(f"  Seasons: {detail.get('seasons')}")
        print(f"  Episodes: {detail.get('episodes')}")
        print(f"  Rating: {detail.get('rating')}")
        print(f"  Media type: {detail.get('media_type')}")
    except Exception as e:
        print(f"  [ERROR] {e}")
else:
    print("  [SKIP] TMDB key not configured")


# ── Test 4: scrape_movie_metadata with a TV series ──────────────
heading("Test 4: scrape_movie_metadata — 'Breaking Bad'")
if tmdb_key:
    result = scrape_movie_metadata("Breaking Bad", 2008)
    if result:
        print(f"  Title: {result.get('title')}")
        print(f"  Year: {result.get('year')}")
        print(f"  Source: {result.get('source')}")
        print(f"  Media type: {result.get('media_type', 'movie')}")
        print(f"  Poster: {'yes' if result.get('poster_url') else 'no'}")
    else:
        print("  [FAIL] No metadata returned")
else:
    print("  [SKIP] TMDB key not configured")


# ── Test 5: scrape_movie_metadata with Chinese TV series ─────────
heading("Test 5: scrape_movie_metadata — '权力的游戏'")
if tmdb_key:
    result = scrape_movie_metadata("权力的游戏", 2011)
    if result:
        print(f"  Title: {result.get('title')}")
        print(f"  Year: {result.get('year')}")
        print(f"  Source: {result.get('source')}")
        print(f"  Media type: {result.get('media_type', 'movie')}")
        print(f"  Seasons: {result.get('seasons')}")
    else:
        print("  [FAIL] No metadata returned")
else:
    print("  [SKIP] TMDB key not configured")


# ── Test 6: scrape_movie_metadata — movie should still work ─────
heading("Test 6 (regression): scrape_movie_metadata — 'The Matrix'")
if tmdb_key:
    result = scrape_movie_metadata("The Matrix", 1999)
    if result:
        print(f"  Title: {result.get('title')}")
        print(f"  Year: {result.get('year')}")
        print(f"  Source: {result.get('source')}")
        print(f"  Media type: {result.get('media_type', 'movie')}")
    else:
        print("  [FAIL] No metadata returned")
else:
    print("  [SKIP] TMDB key not configured")


# ── Test 7: OMDb series search ──────────────────────────────────
heading("Test 7: OMDb series search — 'Breaking Bad'")
if omdb_key:
    results = search_omdb("Breaking Bad", omdb_key, media_type="series")
    print(f"  Results: {len(results)}")
    for r in results[:3]:
        print(f"    - {r.title} ({r.year}) [OMDb:{r.source_id}]")
else:
    print("  [SKIP] OMDb key not configured")


# ── Test 8: OMDb movie search (regression) ──────────────────────
heading("Test 8 (regression): OMDb movie search — 'The Matrix'")
if omdb_key:
    results = search_omdb("The Matrix", omdb_key, media_type="movie")
    print(f"  Results: {len(results)}")
    for r in results[:3]:
        print(f"    - {r.title} ({r.year}) [OMDb:{r.source_id}]")
else:
    print("  [SKIP] OMDb key not configured")


print(f"\n{'='*60}")
print("  Done!")
print(f"{'='*60}")
