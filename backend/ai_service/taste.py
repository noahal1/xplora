"""User taste analysis (genres / decades / ratings) with caching."""

from collections import Counter, defaultdict
import re
import time

from models import MediaRating

from .constants import TASTE_CACHE_TTL, _taste_cache, _taste_cache_key, logger


class TasteMixin:
    """User taste analysis (genres / decades / ratings) with caching."""

    def _analyze_user_taste(self, movies: list[MediaRating]) -> dict:
        """Analyze user's watched movies and extract taste patterns.

        Results are cached keyed by movie content hash.  When the same
        movie list is passed again within the TTL, returns the cached
        result without recomputing.

        Returns a structured dict with:
          - top_genres: genres sorted by avg rating (desc)
          - decade_distribution: count per decade
          - avg_rating: overall average
          - rating_distribution: percent per tier
          - total: movie count
        """
        if not movies:
            return {"top_genres": [], "decade_distribution": {}, "avg_rating": 0, "rating_distribution": {}, "total": 0}

        # ── Check cache ───────────────────────────────────────────────
        cache_key = _taste_cache_key(self.user_id, movies)
        now = time.time()
        cached = _taste_cache.get(cache_key)
        if cached and (now - cached[0]) < TASTE_CACHE_TTL:
            logger.info("Taste analysis cache HIT for %d movies", len(movies))
            return cached[1]

        # Genre analysis — group by genre and compute avg rating
        genre_ratings: dict[str, list[float]] = defaultdict(list)
        decade_count: Counter = Counter()
        ratings = [m.rating for m in movies]
        avg_rating = sum(ratings) / len(ratings)

        for m in movies:
            if m.genre:
                # Split multi-genre (e.g. "Sci-Fi / Action")
                for g in re.split(r"\s*/\s*", m.genre):
                    genre_ratings[g.strip().lower()].append(m.rating)
            if m.year:
                decade = (m.year // 10) * 10
                decade_count[decade] += 1

        # Sort genres by avg rating (desc), take top 5
        top_genres = sorted(
            [
                {"genre": g, "avg_rating": round(sum(v) / len(v), 1), "count": len(v)}
                for g, v in genre_ratings.items()
            ],
            key=lambda x: (-x["avg_rating"], -x["count"]),
        )[:5]

        # Rating distribution
        high = sum(1 for r in ratings if r >= 8)
        mid = sum(1 for r in ratings if 5 <= r < 8)
        low = sum(1 for r in ratings if r < 5)
        total = len(ratings)
        rating_dist = {
            "high_rating_8_10": round(high / total * 100) if total else 0,
            "mid_rating_5_8": round(mid / total * 100) if total else 0,
            "low_rating_0_5": round(low / total * 100) if total else 0,
        }

        # Top decades
        top_decades = dict(decade_count.most_common(3))

        result = {
            "top_genres": top_genres,
            "decade_distribution": top_decades,
            "avg_rating": round(avg_rating, 1),
            "rating_distribution": rating_dist,
            "total": total,
        }

        # ── Store in cache ────────────────────────────────────────────
        _taste_cache[cache_key] = (now, result)
        logger.info("Taste analysis cache STORED for %d movies", len(movies))

        return result


    def _build_taste_summary(self, taste: dict) -> str:
        """Build a human-readable taste summary from analysis results."""
        parts = []
        if taste["top_genres"]:
            genre_desc = "、".join(
                f"{g['genre']}(平均{g['avg_rating']}分/{g['count']}部)"
                for g in taste["top_genres"][:3]
            )
            parts.append(f"  高分类型：{genre_desc}")

        if taste["decade_distribution"]:
            decade_desc = "、".join(
                f"{d}年代({c}部)"
                for d, c in sorted(taste["decade_distribution"].items())
            )
            parts.append(f"  活跃年代：{decade_desc}")

        dist = taste["rating_distribution"]
        parts.append(
            f"  评分分布：高分({dist['high_rating_8_10']}%) 中等({dist['mid_rating_5_8']}%) 低分({dist['low_rating_0_5']}%)"
        )
        parts.append(f"  平均评分：{taste['avg_rating']}/10（共{taste['total']}部）")

        return "\n".join(parts)
