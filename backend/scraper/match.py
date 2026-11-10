"""Compatibility shim — title matching now lives in :mod:`matching`.

Deletion test: this module used to hold the pure functions *and* the
scoring decisions were re-implemented by ``movie_search`` and
``scraper/search.py`` callers. That duplication is now concentrated in
one deep module (``backend/matching.py``) behind ``best_match`` /
``rank``. This shim keeps every importer working with zero churn;
it contains no logic of its own.
"""

from matching import (  # noqa: F401  (re-exported compatibility surface)
    _CN_NUM_MAP,
    _CN_SEASON_RE,
    _EN_SEASON_RE,
    _STOP_WORDS,
    _parse_chinese_number,
    best_match,
    extract_season_number,
    find_best_match,
    has_cjk,
    logger,
    normalize,
    normalize_unicode,
    rank,
    remove_special_chars,
    strip_season,
    title_similarity,
    title_words,
    to_pinyin,
    word_overlap_ratio,
)

__all__ = [
    "best_match",
    "rank",
    "extract_season_number",
    "strip_season",
    "has_cjk",
    "to_pinyin",
    "normalize",
    "normalize_unicode",
    "remove_special_chars",
    "title_words",
    "word_overlap_ratio",
    "title_similarity",
    "find_best_match",
]
