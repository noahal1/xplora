"""TMDB candidate pool building and hybrid recommendation curation."""

from typing import Optional
import time

from models import MediaRating, MediaRecommendation
from movie_search import get_tmdb_movie_recommendations, get_tmdb_movie_similar, get_tmdb_tv_recommendations, get_tmdb_tv_similar
from config_manager import get_api_key as get_config_api_key

from .constants import MAX_TOKENS, SYSTEM_PROMPT_TMDB, TMDB_CACHE_TTL, _tmdb_cache_key, _tmdb_candidate_cache, logger


class TMDCMixin:
    """TMDB candidate pool building and hybrid recommendation curation."""

    def _build_tmdb_candidates(
        self,
        movies: list[MediaRating],
        user_tmdb_ids: list[tuple[str, str]],
        excluded_tmdb_ids: set[str] | None,
        top_n: int = 50,
    ) -> list[dict]:
        """Build a candidate pool from TMDB similar/recommendations.

        For each of the user's top-rated movies (with known TMDB IDs),
        fetches similar movies and recommendations from TMDB, aggregates
        by frequency, and returns the top ``top_n`` candidates that are
        not in ``excluded_tmdb_ids``.

        ``user_tmdb_ids`` is a list of ``(tmdb_id, media_type)`` tuples so
        the correct TMDB API (movie vs TV) is called for each source item.

        Each candidate dict has:
            title, year, genre, poster_url, tmdb_id, media_type,
            score (how many source movies recommended it),
            source_titles (which movies led to it)

        If TMDB is not configured or no TMDB IDs are available,
        returns an empty list (falls through to pure AI mode).
        """
        tmdb_key = get_config_api_key("tmdb")
        if not tmdb_key or not user_tmdb_ids:
            return []

        # ── Check cache ───────────────────────────────────────────────
        cache_key = _tmdb_cache_key(self.user_id, user_tmdb_ids, excluded_tmdb_ids)
        now = time.time()
        cached = _tmdb_candidate_cache.get(cache_key)
        if cached and (now - cached[0]) < TMDB_CACHE_TTL:
            logger.info("TMDB candidate cache HIT for %d source IDs", len(user_tmdb_ids))
            return cached[1]
        logger.info("TMDB candidate cache MISS for %d source IDs", len(user_tmdb_ids))

        from concurrent.futures import ThreadPoolExecutor, as_completed

        all_candidates: list[dict] = []

        def fetch_for_tmdb_id(tmdb_id: str, media_type: str = "movie") -> list[dict]:
            """Fetch similar + recommendations for one movie or TV show.

            Calls the correct TMDB API endpoint based on ``media_type``
            (movie vs tv), so TV shows get TV show recommendations instead
            of being treated as movies.

            Each thread collects its results independently (no shared
            state), then dedup happens in the aggregation step below.
            Includes vote_average and vote_count from TMDB for
            multi-dimensional scoring.
            """
            is_tv = media_type == "tv"
            results: list[dict] = []
            seen_local: set[str] = set()
            try:
                if is_tv:
                    similar = get_tmdb_tv_similar(tmdb_id, tmdb_key)
                else:
                    similar = get_tmdb_movie_similar(tmdb_id, tmdb_key)
                for r in similar:
                    sid = r.source_id
                    if sid not in seen_local and (not excluded_tmdb_ids or sid not in excluded_tmdb_ids):
                        seen_local.add(sid)
                        results.append({
                            "title": r.title,
                            "year": r.year,
                            "genre": r.genre,
                            "poster_url": r.poster_url,
                            "tmdb_id": sid,
                            "media_type": r.media_type,
                            "vote_average": r.vote_average,
                            "vote_count": r.vote_count,
                            "score": 1.0,
                            "source_titles": [tmdb_id],
                        })
            except Exception:
                pass
            try:
                if is_tv:
                    recs = get_tmdb_tv_recommendations(tmdb_id, tmdb_key)
                else:
                    recs = get_tmdb_movie_recommendations(tmdb_id, tmdb_key)
                for r in recs:
                    sid = r.source_id
                    if sid not in seen_local and (not excluded_tmdb_ids or sid not in excluded_tmdb_ids):
                        seen_local.add(sid)
                        results.append({
                            "title": r.title,
                            "year": r.year,
                            "genre": r.genre,
                            "poster_url": r.poster_url,
                            "tmdb_id": sid,
                            "media_type": r.media_type,
                            "vote_average": r.vote_average,
                            "vote_count": r.vote_count,
                            "score": 0.8,  # recommendations weighed slightly less than similar
                            "source_titles": [tmdb_id],
                        })
            except Exception:
                pass
            return results

        # Fetch in parallel (max 15 source movies, genre-diverse selection)
        source_ids = user_tmdb_ids[:15]
        with ThreadPoolExecutor(max_workers=5) as pool:
            futures = {}
            for sid, mt in source_ids:
                future = pool.submit(fetch_for_tmdb_id, sid, mt)
                futures[future] = sid
            for future in as_completed(futures):
                try:
                    batch = future.result()
                    all_candidates.extend(batch)
                except Exception:
                    pass

        # Aggregate by tmdb_id: sum scores, collect sources, keep max vote
        import datetime as _dt
        current_year = _dt.datetime.now().year  # Used for recency scoring
        agg: dict[str, dict] = {}
        for c in all_candidates:
            tid = c["tmdb_id"]
            if tid in agg:
                agg[tid]["score"] += c["score"]
                agg[tid]["source_titles"].extend(c["source_titles"])
                # Keep the highest vote_average and vote_count across sources
                if c.get("vote_average") and (not agg[tid].get("vote_average") or c["vote_average"] > agg[tid]["vote_average"]):
                    agg[tid]["vote_average"] = c["vote_average"]
                    agg[tid]["vote_count"] = c.get("vote_count") or agg[tid].get("vote_count")
            else:
                agg[tid] = dict(c)

        # Multi-dimensional scoring: combine co-occurrence, TMDB rating, popularity, and recency
        # Normalize each signal to 0-1, then weighted combination
        max_co_score = max((c["score"] for c in agg.values()), default=1)
        max_vote_count = max((c.get("vote_count", 0) for c in agg.values()), default=1)
        for c in agg.values():
            co_score = c["score"] / max_co_score  # normalized co-occurrence (0-1)

            vote_avg = c.get("vote_average") or 0
            rating_score = min(vote_avg / 10.0, 1.0)  # TMDB rating (0-1)

            # Popularity signal: log-scaled vote_count to reward well-known movies
            vc = c.get("vote_count", 0) or 0
            popularity_score = min(vc / max_vote_count, 1.0) if max_vote_count > 0 else 0.5
            popularity_score = min(popularity_score ** 0.3, 1.0)  # Diminishing returns — 1000 votes ≈ 1.0, 100 votes ≈ 0.5

            year = c.get("year")
            if year and current_year:
                age = current_year - year
                # Gentle decay: 0yr=1.0, 10yr=0.8, 30yr=0.6, 50yr=0.4
                recency_score = max(0.0, 1.0 - (age / 50) ** 0.6)
            else:
                recency_score = 0.5

            # Weights: co-occurrence + popularity are strongest signals
            c["_combined_score"] = (
                0.40 * co_score
                + 0.25 * rating_score
                + 0.20 * popularity_score
                + 0.15 * recency_score
            )

        # Sort by combined score descending
        ranked = sorted(agg.values(), key=lambda x: -x["_combined_score"])

        # ── Filter out extremely obscure movies (low vote_count) ──
        # Movies with very few TMDB votes are likely obscure and hard to find.
        # Keep at least top_n * 2 candidates before filtering to ensure
        # enough quality candidates for the AI to choose from.
        MIN_VOTE_COUNT = 50  # Movies with fewer than 50 votes are considered obscure
        low_vote_count = sum(1 for c in ranked if (c.get("vote_count") or 0) < MIN_VOTE_COUNT)
        # Always keep at least 5 low-vote candidates to avoid running out
        filtered = [
            c for c in ranked
            if (c.get("vote_count") or 0) >= MIN_VOTE_COUNT or low_vote_count < 5
        ]
        result = filtered[:top_n]

        logger.info(
            "TMDB candidates: %d raw → %d after vote_count≥%d filter → %d final",
            len(ranked), len(filtered), MIN_VOTE_COUNT, len(result),
        )

        # ── Store in cache ────────────────────────────────────────────
        _tmdb_candidate_cache[cache_key] = (now, result)
        logger.info("TMDB candidate cache STORED (%d candidates)", len(result))

        return result


    def get_local_recommendations(
        self,
        movies: list[MediaRating],
        count: int = 5,
        strategy: str = "taste",
        strategy_params: Optional[dict] = None,
        taste_analysis: Optional[dict] = None,
        user_tmdb_ids: Optional[list[tuple[str, str]]] = None,
        excluded_tmdb_ids: Optional[set[str]] = None,
        lang: Optional[str] = None,
    ) -> list[MediaRecommendation]:
        """Pure TMDB recommendations — no AI call required.

        Fallback used when no AI API key is configured: builds the same
        scored candidate pool as the hybrid path, then ranks it with
        strategy-aware rules and attaches human-readable reasons.

        Raises ``ValueError`` with a user-friendly message when TMDB is
        not configured or the candidate pool is empty.
        """
        from config_manager import get_api_key as get_config_api_key

        tmdb_key = get_config_api_key("tmdb")
        if not tmdb_key:
            raise ValueError(
                "未配置任何 AI API Key，且未配置 TMDB API Key，无法生成推荐。"
                "请在设置页面配置 TMDB Key 后使用本地推荐，或配置任意 AI Key。"
            )

        candidates = self._build_tmdb_candidates(
            movies, user_tmdb_ids or [], excluded_tmdb_ids,
        )
        if not candidates:
            raise ValueError(
                "未能从 TMDB 获取到候选推荐。请先对片库执行元数据刮削，"
                "或配置 AI API Key 后重试。"
            )

        # ── Strategy-aware ranking ───────────────────────────────────
        params = strategy_params or {}
        ranked = list(candidates)

        if strategy == "era":
            start = params.get("year_start")
            end = params.get("year_end")
            if start or end:
                ranked = [
                    c for c in ranked
                    if (not start or (c.get("year") or 0) >= start)
                    and (not end or (c.get("year") or 0) <= end)
                ]
        elif strategy == "classics":
            # Prefer well-known, highly-rated titles
            ranked.sort(key=lambda c: -(c.get("vote_average") or 0))
        elif strategy == "gems":
            # Hidden gems: solid rating but less mainstream popularity
            def _gem_score(c: dict) -> float:
                rating = c.get("vote_average") or 0
                votes = c.get("vote_count") or 0
                return rating * 2.0 - min(votes / 10000.0, 1.0)
            ranked.sort(key=_gem_score, reverse=True)
        elif strategy == "explore":
            # Prefer candidates outside the user's top genres
            user_genres = {
                g["genre"].lower()
                for g in (taste_analysis or {}).get("top_genres", [])
            }
            if user_genres:
                def _explore_score(c: dict) -> float:
                    base = c.get("_combined_score", 0.5)
                    c_genres = {g.strip().lower() for g in (c.get("genre") or "").split("/")}
                    overlap = len(c_genres & user_genres)
                    return base - 0.25 * overlap
                ranked.sort(key=_explore_score, reverse=True)
        else:
            # taste / mood / playlist: combined score already computed
            ranked.sort(key=lambda c: -(c.get("_combined_score") or 0))

        if not ranked:
            raise ValueError("没有符合当前筛选条件的候选推荐，请调整策略或筛选条件")

        # ── Build MediaRecommendation objects ─────────────────────────
        recs: list[MediaRecommendation] = []
        seen: set[str] = set()
        for c in ranked:
            title = c.get("title", "")
            if not title or title.lower() in seen:
                continue
            seen.add(title.lower())
            recs.append(MediaRecommendation(
                title=title,
                year=c.get("year"),
                genre=c.get("genre"),
                reason=self._build_local_reason(c, strategy, lang),
                confidence=round(min((c.get("_combined_score") or 0.5) + 0.3, 0.95), 2),
                media_type=c.get("media_type", "movie"),
                poster_url=c.get("poster_url"),
                tmdb_id=c.get("tmdb_id"),
            ))
            if len(recs) >= count:
                break

        # Final safety filter against watched titles (by fuzzy title match)
        recs = self._filter_watched(recs, [m.title for m in movies if m.title])
        return recs[:count]

    def _build_local_reason(self, candidate: dict, strategy: str, lang: Optional[str]) -> str:
        """Build a short human-readable reason for a local TMDB pick."""
        en = lang == "en"
        sources = candidate.get("source_titles") or []
        source_count = len(sources)
        base = {
            "taste": "Matches your viewing taste" if en else "符合你的观影口味",
            "classics": "A critically acclaimed classic" if en else "广受好评的经典佳作",
            "mood": "Fits the mood you described" if en else "符合你描述的心情",
            "gems": "An underrated hidden gem" if en else "被低估的口碑遗珠",
            "explore": "A fresh pick outside your usual genres" if en else "跳出你常看类型的新鲜选择",
            "playlist": "Fits the playlist theme" if en else "契合片单主题",
        }.get(strategy, "Recommended based on your library" if en else "基于你的片库推荐")
        if source_count > 1:
            base += f" (×{source_count})" if en else f"（{source_count} 部影片关联）"
        return base

    def _get_tmdb_hybrid_recommendations(
        self,
        movies: list[MediaRating],
        count: int = 5,
        strategy: str = "taste",
        strategy_params: Optional[dict] = None,
        taste_analysis: Optional[dict] = None,
        user_tmdb_ids: Optional[list[tuple[str, str]]] = None,
        excluded_tmdb_ids: Optional[set[str]] = None,
        lang: Optional[str] = None,
    ) -> list[MediaRecommendation]:
        """Hybrid recommendation: TMDB candidate pool + AI curation.

        Works for ALL strategies — builds a candidate pool from TMDB
        similar/recommendations, then asks the AI to select from it
        using the appropriate strategy instruction.

        1. Build candidate pool from TMDB similar/recommendations
        2. If no candidates, raise ValueError (caller falls back to pure AI)
        3. Present top candidates + strategy instruction to AI
        4. Final results already have tmdb_id attached, no need for _resolve_metadata

        This approach:
        - Eliminates AI hallucinations (movies come from real TMDB data)
        - No retry loop needed (candidates are pre-filtered)
        - No large exclusion list needed in prompt (already filtered)
        - TMDB IDs are known upfront, cross-language dedup works
        """
        tmdb_candidates = self._build_tmdb_candidates(
            movies, user_tmdb_ids or [], excluded_tmdb_ids,
        )

        if not tmdb_candidates:
            raise ValueError(
                "TMDB 推荐暂不可用"
                if not get_config_api_key("tmdb")
                else "未能从 TMDB 获取到候选推荐，请尝试其他推荐策略"
            )

        # Use the unified _build_prompt with candidates for hybrid mode
        prompt = self._build_prompt(
            movies, count, strategy, strategy_params,
            taste_analysis=taste_analysis,
            candidates=tmdb_candidates,
            lang=lang,
        )

        try:
            response = self._create_chat(
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT_TMDB},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.5,
                max_tokens=MAX_TOKENS,
                timeout=60,
            )
        except Exception as e:
            raise ValueError(f"AI service error: {e}")

        if not response.choices or not response.choices[0].message:
            raise ValueError("Empty response from AI model")
        content = response.choices[0].message.content
        if not content:
            raise ValueError("Empty response from AI model")

        recs = self._parse_response(content)

        # Attach tmdb_id, poster_url, media_type from candidates
        candidate_map = {c["tmdb_id"]: c for c in tmdb_candidates}
        for rec in recs:
            matched = None
            for c in tmdb_candidates:
                if c["title"].lower() == rec.title.lower() or (
                    c.get("year") and rec.year and c["year"] == rec.year
                    and c["title"].lower() == rec.title.lower()
                ):
                    matched = c
                    break
            if not matched and rec.tmdb_id and rec.tmdb_id in candidate_map:
                matched = candidate_map[rec.tmdb_id]

            if matched:
                rec.tmdb_id = matched.get("tmdb_id", rec.tmdb_id)
                rec.poster_url = matched.get("poster_url", rec.poster_url)
                rec.media_type = matched.get("media_type", rec.media_type)
                if not rec.year and matched.get("year"):
                    rec.year = matched["year"]
                if not rec.genre and matched.get("genre"):
                    rec.genre = matched["genre"]

        # Fallback metadata resolution: recs whose title didn't exactly match a
        # candidate (e.g. AI rewrote the title) still need poster + tmdb_id.
        # Already-resolved recs are skipped inside _resolve_metadata.
        recs = self._resolve_metadata(recs)

        # Final safety filter: remove any recs that are in excluded_tmdb_ids
        if excluded_tmdb_ids:
            recs = [r for r in recs if not (r.tmdb_id and r.tmdb_id in excluded_tmdb_ids)]

        return recs[:count]
