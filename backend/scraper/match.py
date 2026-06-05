"""Title matching helpers for metadata scraping."""

import logging
import re
import unicodedata
from typing import Optional

logger = logging.getLogger(__name__)


# ============================================
# Season stripping helpers
# ============================================

# Regex patterns for season markers in titles
# Chinese numeral mapping
_CN_NUM_MAP: dict[str, int] = {
    "零": 0, "〇": 0,
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
    "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
    "百": 100, "千": 1000,
}

_CN_SEASON_RE = re.compile(
    r"第["
    r"一二三四五六七八九十零〇百千"
    r"\d]+"
    r"季"
)
_EN_SEASON_RE = re.compile(
    r"(?:\s+Season\s+|\s+S\s*)\d+\s*",
    re.IGNORECASE,
)


def _parse_chinese_number(s: str) -> int:
    """Parse Chinese numeral string to integer.

    ``"一"`` → ``1``, ``"十"`` → ``10``,
    ``"十一"`` → ``11``, ``"二十"`` → ``20``,
    ``"二十一"`` → ``21``.
    """
    if len(s) == 1:
        return _CN_NUM_MAP.get(s, 0)

    # Compound numbers with 十
    if "十" in s:
        parts = s.split("十")
        left = parts[0]
        right = parts[1] if len(parts) > 1 else ""
        val_left = _CN_NUM_MAP.get(left, 0) if left else 1  # bare 十 → left=1
        val_right = _CN_NUM_MAP.get(right, 0) if right else 0
        return val_left * 10 + val_right

    # Try parsing as combination of multipliers
    total = 0
    acc = 0
    for ch in s:
        n = _CN_NUM_MAP.get(ch, 0)
        if n >= 10:
            acc = max(acc, 1) * n
            total += acc
            acc = 0
        else:
            acc = n
    total += acc
    return total or 0


def extract_season_number(title: str) -> int | None:
    """Extract season number from a title with season marker.

    ``"黑袍纠察队 第四季"`` → ``4``  (Chinese numeral)
    ``"The Boys Season 4"`` → ``4``
    ``"The Boys S4"`` → ``4``
    ``"千与千寻"`` → ``None``
    ``"权力的游戏 第一季"`` → ``1``
    """
    # Chinese: 第X季
    m = _CN_SEASON_RE.search(title)
    if m:
        raw = m.group()  # e.g. "第四季"
        num_str = raw[1:-1]  # strip 第 / 季
        if num_str.isdigit():
            return int(num_str)
        return _parse_chinese_number(num_str)

    # English: Season X or SX
    m = _EN_SEASON_RE.search(title)
    if m:
        raw = m.group().strip()
        d = re.search(r"\d+", raw)
        if d:
            return int(d.group())

    return None


def strip_season(title: str) -> str:
    """Remove season markers from a title for cleaner search.

    Handles:
    - Chinese: ``第四季``, ``第1季``, ``第01季``
    - English: ``Season 4``, ``S4``, ``Season 04``

    ``"黑袍纠察队 第四季"`` → ``"黑袍纠察队"``
    ``"The Boys Season 4"`` → ``"The Boys"``
    ``"The Boys S4"`` → ``"The Boys"``
    """
    cleaned = _CN_SEASON_RE.sub("", title)
    cleaned = _EN_SEASON_RE.sub("", cleaned)
    return cleaned.strip()


# ============================================
# Pinyin / CJK helpers
# ============================================


def has_cjk(text: str) -> bool:
    """Check whether a string contains CJK (Chinese / Japanese / Korean) characters."""
    for ch in text:
        cp = ord(ch)
        if (
            0x4E00 <= cp <= 0x9FFF
            or 0x3400 <= cp <= 0x4DBF
            or 0x20000 <= cp <= 0x2A6DF
        ):
            return True
    return False


def to_pinyin(text: str) -> str | None:
    """Convert Chinese text to pinyin (``千与千寻`` → ``qian yu qian xun``).

    Returns ``None`` if the ``pypinyin`` library is not available, so
    callers can degrade gracefully.
    """
    if not has_cjk(text):
        return None
    try:
        from pypinyin import lazy_pinyin

        words = lazy_pinyin(text)
        return " ".join(words)
    except ImportError:
        logger.debug("pypinyin not installed — skipping pinyin conversion")
        return None


# ============================================
# Title matching helpers
# ============================================

# Common stop words in movie titles (EN / FR / DE / ES / IT)
_STOP_WORDS: set[str] = {
    "the", "a", "an", "and", "or", "of", "in", "to", "for",
    "is", "it", "on", "at", "by", "with", "from", "as", "its",
    "das", "der", "die", "dem", "den", "des", "ein", "eine",
    "el", "la", "le", "les", "de", "un", "une", "du", "des",
    "il", "lo", "gli", "i", "gli",
    "y", "lo", "los", "las",
}


def normalize(s: str) -> str:
    """Normalize a title for comparison: lowercase, strip, remove extra spaces."""
    return " ".join(s.lower().strip().split())


def normalize_unicode(s: str) -> str:
    """Normalize Unicode characters, converting accented letters to ASCII.

    E.g. ``Amélie`` → ``Amelie``, ``Café`` → ``Cafe``.
    """
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def remove_special_chars(s: str) -> str:
    """Strip punctuation and special characters, keeping only letters,
    digits, and whitespace."""
    return re.sub(r"[^\w\s]", "", s)


def title_words(s: str) -> set[str]:
    """Extract meaningful words from a title (lowercased, no stop words,
    no single letters, no punctuation)."""
    cleaned = remove_special_chars(s)
    cleaned = normalize_unicode(cleaned)
    words = cleaned.lower().split()
    return {w for w in words if w not in _STOP_WORDS and len(w) > 1}


def word_overlap_ratio(a: str, b: str) -> float:
    """Jaccard-like word overlap between two titles.

    Returns the fraction of the smaller title's words that also appear
    in the larger title (``intersection / min(len_a, len_b)``).
    """
    words_a = title_words(a)
    words_b = title_words(b)
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    return len(intersection) / min(len(words_a), len(words_b))


def titles_match(a: str, b: str) -> bool:
    """Check if two movie titles match, using progressively fuzzier strategies.

    1. Exact match (after basic normalization)
    2. Substring match
    3. Unicode-normalized + punctuation-stripped match
    4. Word overlap >= 70%
    """
    a = normalize(a)
    b = normalize(b)
    if not a or not b:
        return False

    # Strategy 1: Exact or substring
    if a == b or a in b or b in a:
        return True

    # Strategy 2: Remove accents + punctuation, then compare
    a_clean = remove_special_chars(normalize_unicode(a))
    b_clean = remove_special_chars(normalize_unicode(b))
    if not a_clean or not b_clean:
        return False
    if a_clean == b_clean or a_clean in b_clean or b_clean in a_clean:
        return True

    # Strategy 3: Word overlap fuzzy matching
    if word_overlap_ratio(a, b) >= 0.7:
        return True

    return False


def find_best_match(results: list[dict], title: str, year: Optional[int]) -> Optional[dict]:
    """Find the best matching TMDB result using fuzzy title similarity + year.

    Priority:
    1. Original title fuzzy match + year match
    2. Localized title fuzzy match + year match
    3. Year match (any title)
    4. Original title fuzzy match (no year)
    5. Localized title fuzzy match (no year)
    6. Word-overlap >= 70% (any result, no year)
    7. First result (fallback)
    """
    if not results:
        return None

    # Priority 1: original_title + year (best evidence)
    if year:
        for r in results:
            ot = r.get("original_title") or ""
            if titles_match(ot, title) and r.get("year") == year:
                return r

    # Priority 2: localized title + year
    if year:
        for r in results:
            rt = r.get("title") or ""
            if titles_match(rt, title) and r.get("year") == year:
                return r

    # Priority 3: year match + at least some title overlap
    if year:
        for r in results:
            if r.get("year") == year:
                ot = r.get("original_title") or ""
                rt = r.get("title") or ""
                combined = f"{ot} {rt}"
                if word_overlap_ratio(combined, title) >= 0.3:
                    return r

    # Priority 4: original_title fuzzy match (no year)
    for r in results:
        ot = r.get("original_title") or ""
        if titles_match(ot, title):
            return r

    # Priority 5: localized title fuzzy match (no year)
    for r in results:
        rt = r.get("title") or ""
        if titles_match(rt, title):
            return r

    # Priority 6: word-overlap >= 50% (fallback for heavily different titles)
    for r in results:
        ot = r.get("original_title") or ""
        rt = r.get("title") or ""
        combined = f"{ot} {rt}"
        if word_overlap_ratio(combined, title) >= 0.5:
            return r

    # No good match found — return None rather than attaching wrong metadata
    logger.info(
        "No confident match for '%s' (year=%s) among %d results",
        title, year, len(results),
    )
    return None
