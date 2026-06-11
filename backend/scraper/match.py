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


def _title_similarity(a: str, b: str) -> float:
    """Compute title similarity as a continuous score between 0.0 and 1.0.

    Uses the same strategies as :func:`titles_match` but returns a graded
    score instead of a boolean, allowing fine-grained ranking of candidates.

    ======= ============================================================
    Score   Condition
    ======= ============================================================
    1.00    Exact match (after basic normalization)
    0.95    Substring match (one title is contained in the other)
    0.90    Unicode-normalized + punctuation-stripped match
    0.70–   Word overlap >= 70% (scaled linearly to 0.70–0.90)
    0.50–   Word overlap 50–70% (scaled linearly to 0.50–0.70)
    0.30–   Word overlap 30–50% (scaled linearly to 0.30–0.50)
    0.00    Below confidence — no meaningful similarity
    ======= ============================================================
    """
    a = normalize(a)
    b = normalize(b)
    if not a or not b:
        return 0.0

    # 1.00: Exact match
    if a == b:
        return 1.0

    # 0.95: Substring match
    if a in b or b in a:
        return 0.95

    # 0.90: Unicode-normalized + punctuation-stripped match
    a_clean = remove_special_chars(normalize_unicode(a))
    b_clean = remove_special_chars(normalize_unicode(b))
    if not a_clean or not b_clean:
        return 0.0
    if a_clean == b_clean:
        return 0.9

    # Graded word overlap
    overlap = word_overlap_ratio(a, b)
    if overlap >= 0.7:
        return 0.70 + (overlap - 0.7) * (0.20 / 0.30)
    elif overlap >= 0.5:
        return 0.50 + (overlap - 0.5) * (0.20 / 0.20)
    elif overlap >= 0.3:
        return 0.30 + (overlap - 0.3) * (0.20 / 0.20)

    return 0.0


def find_best_match(results: list[dict], title: str, year: Optional[int]) -> Optional[dict]:
    """Find the best matching result using scored ranking.

    Scores **all** candidates on a continuous scale rather than returning
    the first match at each priority level.  This correctly handles cases
    where TMDB returns multiple similar results — the best title match wins,
    not whichever TMDB happened to rank first by popularity.

    Scoring:
    - **Title similarity** (primary): compares ``title`` against both the
      result's localized ``title`` and ``original_title`` via
      :func:`_title_similarity`, taking the better score.  Falls back to
      word overlap on the concatenated original + localized title.
    - **Year boost**: if the result's year matches the target year **and**
      there is meaningful title similarity (score >= 0.3), the title score
      is multiplied by 1.3\u00d7.
    - **Minimum threshold**: results scoring below 0.30 are rejected to
      avoid attaching completely wrong metadata.

    Returns the highest-scoring result, or ``None`` if no result meets
    the minimum bar.
    """
    if not results:
        return None

    _MIN_CONFIDENCE = 0.30
    best_score = 0.0
    best_result = None

    for r in results:
        rt = r.get("title") or ""
        ot = r.get("original_title") or ""

        # Title similarity: best of localized and original title
        candidates = []
        if rt:
            candidates.append(rt)
        if ot and ot != rt:
            candidates.append(ot)
        if candidates:
            title_score = max(_title_similarity(title, c) for c in candidates)
        else:
            title_score = 0.0

        # Fallback: combined original + localized for word overlap
        # (e.g. when search term shares words across both titles)
        if not title_score:
            combined = f"{ot} {rt}".strip()
            if combined:
                overlap = word_overlap_ratio(combined, title)
                if overlap >= 0.3:
                    title_score = overlap

        # Year boost: 1.3x multiplier, requires meaningful title overlap
        year_mult = 1.0
        if year is not None and r.get("year") == year and title_score >= 0.3:
            year_mult = 1.3

        score = title_score * year_mult

        if score > best_score:
            best_score = score
            best_result = r

    if best_score < _MIN_CONFIDENCE:
        logger.info(
            "No confident match for '%s' (year=%s) — "
            "best score %.3f < %.2f threshold among %d results",
            title, year, best_score, _MIN_CONFIDENCE, len(results),
        )
        return None

    return best_result
