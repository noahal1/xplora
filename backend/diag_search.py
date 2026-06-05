"""Temporary diagnostic: trace the scrape pipeline for a given title."""
import os, sys
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from scraper.search import _get_search_variants, search_tmdb, search_tmdb_tv, search_omdb, search_tvmaze
from scraper.match import find_best_match, to_pinyin, has_cjk, extract_season_number

TITLE = sys.argv[1] if len(sys.argv) > 1 else "大佬 / Brother"
YEAR = int(sys.argv[2]) if len(sys.argv) > 2 else 2000

print(f"=== TITLE={TITLE!r}  YEAR={YEAR} ===")
print(f"season_number = {extract_season_number(TITLE)}")
variants = _get_search_variants(TITLE)
print(f"variants = {variants}")
for v in variants:
    print(f"  pinyin({v!r}) = {to_pinyin(v) if has_cjk(v) else None}")

def show(label, results):
    print(f"\n--- {label}: {len(results) if results else 0} results ---")
    for r in (results or [])[:8]:
        print(f"   id={r.get('source_id'):>8}  year={r.get('year')}  "
              f"type={r.get('media_type')}  title={r.get('title')!r}  "
              f"orig={r.get('original_title')!r}")

for v in variants:
    print(f"\n########## VARIANT {v!r} ##########")
    mv = search_tmdb(v)
    show(f"TMDB movie [{v}]", mv)
    m = find_best_match(mv or [], v, YEAR)
    print(f"   >> find_best_match(movie) = {m.get('source_id') if m else None} "
          f"{m.get('title') if m else ''}")

    tv = search_tmdb_tv(v)
    show(f"TMDB tv [{v}]", tv)
    m = find_best_match(tv or [], v, YEAR)
    print(f"   >> find_best_match(tv) = {m.get('source_id') if m else None} "
          f"{m.get('title') if m else ''}")
