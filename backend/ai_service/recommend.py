"""Recommendations: generation, parsing, taste analysis, and filtering.

This is the deep implementation module behind the :class:`AIService` facade.
It owns the full recommendation concept end-to-end — the public entry points
(``get_recommendations``, ``get_recommendations_stream``,
``get_followup_stream``) plus the internal parsing, taste-analysis, and
filtering helpers they depend on.  Keeping these together means understanding
one recommendation no longer requires bouncing between a base class and eight
thin mixin modules.

The public interface of the composed :class:`AIService` is intentionally small;
see ``backend/ai_service/__init__.py``.  Every ``_``-prefixed method here is an
internal implementation detail.

Backwards-compatibility aliases (``ParsingMixin``, ``TasteMixin``,
``FilterMixin``) are kept at module level for any external importer that used
the old class names.  They intentionally all point at ``RecommendMixin`` and
are NOT used as additional bases of ``AIService`` (that would create a
duplicate-base MRO error).
"""

import json
import re
import time
from collections import Counter, defaultdict
from typing import Optional

from openai import APIConnectionError, APIError, APITimeoutError, AuthenticationError, RateLimitError
from models import MediaRating, MediaRecommendation
from config_manager import get_api_key as get_config_api_key
from movie_search import search_movies as search_external_movies
from scraper.match import has_cjk, normalize, normalize_unicode, remove_special_chars, title_words

from .constants import (
    DEFAULT_TEMPERATURE,
    MAX_API_RETRIES,
    MAX_TOKENS,
    MIN_RETRIES_FOR_FULL_LOOP,
    SMALL_REQUEST_RETRY_CAP,
    STRATEGY_TEMPERATURES,
    SYSTEM_PROMPT_FOLLOWUP,
    SYSTEM_PROMPT_RECOMMEND,
    TASTE_CACHE_TTL,
    TMDB_SKIP_STRATEGIES,
    _get_filtered_out,
    _get_title,
    _taste_cache,
    _taste_cache_key,
    logger,
)


class RecommendMixin:
    """Recommendation generation, parsing, taste analysis, and filtering.

    One deep mixin: a small set of public entry points backed by a large
    hidden implementation (all ``_``-prefixed helpers below).
    """

    def _retry_loop(
        self,
        movies: list[MediaRating],
        count: int,
        strategy: str,
        strategy_params: Optional[dict],
        all_excluded: list[str],
        taste_analysis: Optional[dict],
        previous_feedback: Optional[dict],
        call_ai,
        lang: Optional[str] = None,
        rag_context=None,
    ) -> tuple[list, int]:
        """Shared retry loop for the pure-AI recommendation path.

        ``call_ai(prompt, attempt)`` receives the prompt string and attempt
        number, and returns either a list of parsed recommendations (dicts
        or ``MediaRecommendation`` objects) or ``None`` to break the loop.
        The callback must handle its own exceptions.  Returning ``None``
        silently breaks the loop without raising.

        Returns ``(all_recs, total_filtered)``.
        """
        # Small requests (e.g. the default 5 recs) cap the retry budget so a
        # filter-heavy library can't stack several sequential 30-60s AI calls.
        max_retries = (
            min(SMALL_REQUEST_RETRY_CAP, MAX_API_RETRIES)
            if count < MIN_RETRIES_FOR_FULL_LOOP
            else min(max(3, count), MAX_API_RETRIES)
        )
        all_recs = []
        total_filtered = 0
        filtered_titles_info = None

        for attempt in range(max_retries):
            remaining = count - len(all_recs)
            if remaining <= 0:
                break

            request_count = min(remaining * 2, 10) if attempt > 0 else remaining

            prompt = self._build_prompt(
                movies, request_count, strategy, strategy_params,
                watched_titles=all_excluded, taste_analysis=taste_analysis,
                exclude_titles=all_excluded,
                retry_attempt=attempt,
                previous_feedback=previous_feedback,
                filtered_titles_info=filtered_titles_info,
                lang=lang,
            )

            new_recs = call_ai(prompt, attempt)
            if new_recs is None:
                break

            before = list(new_recs)
            new_recs = self._filter_watched(new_recs, all_excluded)
            filtered_out = _get_filtered_out(before, new_recs)
            total_filtered += len(filtered_out)

            filtered_titles_info = None
            if filtered_out:
                filtered_titles_info = [
                    (_get_title(r), "已在用户的已看/想看列表中")
                    for r in filtered_out
                ]

            if not new_recs:
                continue

            all_recs.extend(new_recs)
            for r in new_recs:
                t = _get_title(r)
                if t and t not in all_excluded:
                    all_excluded.append(t)

        if total_filtered > 0:
            logger.info(
                "[Recommend] Filtered out %d already-watched titles (%d/%d final)",
                total_filtered, len(all_recs[:count]), count,
            )

        return all_recs, total_filtered


    def get_recommendations(
        self,
        movies: list[MediaRating],
        count: int = 5,
        strategy: str = "taste",
        strategy_params: Optional[dict] = None,
        watched_titles: Optional[list[str]] = None,
        taste_analysis: Optional[dict] = None,
        previous_feedback: Optional[dict] = None,
        excluded_tmdb_ids: Optional[set[str]] = None,
        lang: Optional[str] = None,
        rag_context=None,
    ) -> list[MediaRecommendation]:
        """Generate movie recommendations (non-streaming) with dynamic retry.

        Delegates the retry loop to ``_retry_loop()`` for a shared
        implementation with ``get_recommendations_stream``.

        When ``user_tmdb_ids`` are available in ``strategy_params``,
        all strategies (except those in ``TMDB_SKIP_STRATEGIES``)
        use the hybrid approach first.
        """
        # ── Try TMDB hybrid (skip for strategies where it doesn't make sense) ──
        user_tmdb_ids = (strategy_params or {}).get("user_tmdb_ids", [])
        if user_tmdb_ids and strategy not in TMDB_SKIP_STRATEGIES:
            try:
                return self._get_tmdb_hybrid_recommendations(
                    movies=movies,
                    count=count,
                    strategy=strategy,
                    strategy_params=strategy_params,
                    taste_analysis=taste_analysis,
                    user_tmdb_ids=user_tmdb_ids,
                    excluded_tmdb_ids=excluded_tmdb_ids,
                    lang=lang,
                    rag_context=rag_context,
                )
            except Exception as e:
                logger.warning(
                    "TMDB hybrid failed for strategy '%s': %s — falling back to pure AI",
                    strategy, e,
                )
                # Fall through to standard AI-only path

        # ── Standard AI-only path (fallback) ─────────────────────────────
        temperature = STRATEGY_TEMPERATURES.get(strategy, DEFAULT_TEMPERATURE)
        all_excluded = list(watched_titles or [])

        def _sync_call_ai(prompt: str, attempt: int):
            """Blocking (non-streaming) AI call used by _retry_loop."""
            try:
                response = self._create_chat(
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT_RECOMMEND},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=temperature,
                    max_tokens=MAX_TOKENS,
                    timeout=60,
                )
            except AuthenticationError:
                raise ValueError(f"Authentication failed for {self.model_type}. Please check your API key.")
            except RateLimitError:
                raise ValueError(f"Rate limit exceeded for {self.model_type}. Please try again later.")
            except APITimeoutError:
                raise ValueError(f"Request to {self.model_type} timed out. Please try again.")
            except APIConnectionError:
                raise ValueError(f"无法连接到 {self.model_type} API，请检查网络连接和 API 地址配置")
            except APIError as e:
                code = getattr(e, "status_code", "unknown")
                raise ValueError(f"{self.model_type} API error ({code}): {e.message}")

            if not response.choices or not response.choices[0].message:
                # No choices (some gateways return empty choices on errors) or
                # empty content (reasoning model spent all max_tokens on
                # thinking). Return [] so _retry_loop keeps retrying instead
                # of failing the whole request.
                if attempt == 0:
                    logger.warning("Empty response from %s on first attempt, retrying", self.model_type)
                return []
            content = response.choices[0].message.content
            if not content:
                if attempt == 0:
                    logger.warning("Empty content from %s on first attempt, retrying", self.model_type)
                return []

            try:
                return self._parse_response(content)
            except ValueError:
                if attempt == 0:
                    raise
                return None  # Break retry loop, keep partial results

        all_recs, _ = self._retry_loop(
            movies, count, strategy, strategy_params,
            all_excluded, taste_analysis, previous_feedback,
            _sync_call_ai, lang=lang, rag_context=rag_context,
        )

        all_recs = self._resolve_metadata(all_recs)
        all_recs = self._filter_by_tmdb_id(all_recs, excluded_tmdb_ids)
        return all_recs[:count]


    def get_followup_stream(
        self,
        movies: list[MediaRating],
        previous_recommendations: list,
        conversation: list,
        question: str,
        count: int = 3,
        watched_titles: Optional[list[str]] = None,
        taste_analysis: Optional[dict] = None,
        excluded_tmdb_ids: Optional[set[str]] = None,
        lang: Optional[str] = None,
        rag_context=None,
    ):
        """Generator that yields SSE-formatted events for follow-up conversation.

        If the response includes recommendations and the fuzzy dedup filter
        removes some, retries with dynamic retry count to fill the gap.
        After metadata resolution, also filters by ``excluded_tmdb_ids``.
        """
        max_retries = min(max(3, count), MAX_API_RETRIES)  # Dynamic but capped
        temperature = STRATEGY_TEMPERATURES.get("taste", DEFAULT_TEMPERATURE)
        all_excluded = list(watched_titles or [])
        all_recs: list[dict] = []
        response_message: str | None = None
        total_filtered = 0

        # Yield start event
        start_data = json.dumps({"model": self.model_type})
        yield f"event: start\ndata: {start_data}\n\n"

        for attempt in range(max_retries):
            remaining = count - len(all_recs)
            if remaining <= 0:
                break

            # Scale up request on retry to compensate for filtering losses
            request_count = min(remaining * 2, 10) if attempt > 0 else remaining

            prompt = self._build_followup_prompt(
                movies, previous_recommendations, conversation, question, request_count,
                taste_analysis=taste_analysis,
                exclude_titles=all_excluded,
                lang=lang,
            )

            try:
                stream = self._create_chat(
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT_FOLLOWUP},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=temperature,
                    max_tokens=MAX_TOKENS,
                    timeout=60,
                    stream=True,
                )
            except AuthenticationError:
                yield f"event: error\ndata: {json.dumps({'message': f'Authentication failed for {self.model_type}. Please check your API key.'})}\n\n"
                return
            except RateLimitError:
                yield f"event: error\ndata: {json.dumps({'message': f'Rate limit exceeded for {self.model_type}. Please try again later.'})}\n\n"
                return
            except APITimeoutError:
                yield f"event: error\ndata: {json.dumps({'message': f'Request to {self.model_type} timed out. Please try again.'})}\n\n"
                return
            except APIConnectionError:
                yield f"event: error\ndata: {json.dumps({'message': f'无法连接到 {self.model_type} API，请检查网络连接和 API 地址配置'})}\n\n"
                return
            except APIError as e:
                code = getattr(e, "status_code", "unknown")
                yield f"event: error\ndata: {json.dumps({'message': f'{self.model_type} API error ({code}): {e.message}'})}\n\n"
                return

            accumulated = ""

            for chunk in stream:
                # Some gateways send chunks with empty choices (e.g. a final
                # chunk carrying only usage/finish info) — skip them.
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    token = delta.content
                    accumulated += token
                    yield f"event: chunk\ndata: {json.dumps({'text': token})}\n\n"

            # Parse response
            try:
                json_str = self._extract_json(accumulated)
                data = json.loads(json_str)
            except (json.JSONDecodeError, ValueError):
                # If we already have results, return those; otherwise fallback
                if all_recs:
                    break
                fallback = json.dumps({
                    "type": "text",
                    "message": accumulated.strip() or "抱歉，AI 暂时无法回答这个问题，请换个方式试试。",
                }, ensure_ascii=False)
                yield f"event: result\ndata: {fallback}\n\n"
                return

            if data.get("type") == "text":
                # Text response — yield immediately, no retry needed
                response_message = data.get("message", "")
                result_data = json.dumps(data, ensure_ascii=False)
                yield f"event: result\ndata: {result_data}\n\n"
                return

            # Type is "recommendations" — filter and accumulate
            new_recs = data.get("recommendations", [])
            if not new_recs:
                break

            before_filter = len(new_recs)
            new_recs = self._filter_watched(new_recs, all_excluded)
            total_filtered += before_filter - len(new_recs)

            if not new_recs:
                # filtered all — continue retrying instead of breaking
                continue

            response_message = data.get("message", "")
            all_recs.extend(new_recs)
            all_excluded.extend(r.get("title", "") for r in new_recs)

        if total_filtered > 0:
            logger.info("FollowUp filtered out %d already-watched titles (%d/%d final)",
                        total_filtered, len(all_recs[:count]), count)

        # Resolve poster URLs + TMDB IDs from TMDB
        all_recs = self._resolve_metadata(all_recs)
        all_recs = self._filter_by_tmdb_id(all_recs, excluded_tmdb_ids)

        # Yield final result with accumulated recommendations
        result_data = json.dumps({
            "type": "recommendations",
            "message": response_message or f"为您推荐以下{len(all_recs[:count])}部电影",
            "recommendations": all_recs[:count],
        }, ensure_ascii=False)
        yield f"event: result\ndata: {result_data}\n\n"


    def get_recommendations_stream(
        self,
        movies: list[MediaRating],
        count: int = 5,
        strategy: str = "taste",
        strategy_params: Optional[dict] = None,
        watched_titles: Optional[list[str]] = None,
        taste_analysis: Optional[dict] = None,
        previous_feedback: Optional[dict] = None,
        excluded_tmdb_ids: Optional[set[str]] = None,
        lang: Optional[str] = None,
        rag_context=None,
    ):
        """Generator that yields SSE-formatted events as recommendations are streamed.

        If the fuzzy dedup filter removes some recommendations, this retries
        with dynamic retry count based on the requested amount — each time
        asking the AI to recommend different movies — until the requested
        ``count`` is met.  Chunk events from each retry attempt are forwarded
        to the frontend for progress indication, but all recommendations are
        yielded after all retries complete, followed by a single ``done`` event.

        After metadata resolution, also filters by ``excluded_tmdb_ids``
        (exact TMDB ID matching) to catch cross-language duplicates.

        When ``user_tmdb_ids`` are available in ``strategy_params``,
        all strategies (except those in ``TMDB_SKIP_STRATEGIES``)
        use the hybrid approach via
        ``_get_tmdb_hybrid_recommendations`` and yields results as SSE events.
        """
        # ── Try TMDB hybrid (skip for strategies where it doesn't make sense) ──
        user_tmdb_ids = (strategy_params or {}).get("user_tmdb_ids", [])
        if user_tmdb_ids and strategy not in TMDB_SKIP_STRATEGIES:
            try:
                recs = self._get_tmdb_hybrid_recommendations(
                    movies=movies,
                    count=count,
                    strategy=strategy,
                    strategy_params=strategy_params,
                    taste_analysis=taste_analysis,
                    user_tmdb_ids=user_tmdb_ids,
                    excluded_tmdb_ids=excluded_tmdb_ids,
                    lang=lang,
                )
                # Yield start event
                start_data = json.dumps({"model": self.model_type, "source_count": len(movies)})
                yield f"event: start\ndata: {start_data}\n\n"

                # Yield each recommendation as SSE event
                for rec in recs:
                    rec_data = json.dumps({
                        "title": rec.title,
                        "year": rec.year,
                        "genre": rec.genre,
                        "reason": rec.reason,
                        "confidence": rec.confidence,
                        "poster_url": rec.poster_url,
                        "tmdb_id": rec.tmdb_id,
                        "media_type": rec.media_type,
                    })
                    yield f"event: recommendation\ndata: {rec_data}\n\n"

                # Yield done event
                done_data = json.dumps({
                    "model_used": self.model_type,
                    "source_count": len(movies),
                    "total": len(recs),
                    "filtered_count": 0,
                })
                yield f"event: done\ndata: {done_data}\n\n"
                return

            except Exception as e:
                logger.warning(
                    "TMDB hybrid streaming failed for strategy '%s': %s — falling back to pure AI",
                    strategy, e,
                )
                # Clear user_tmdb_ids to prevent infinite recursion
                fallback_params = dict(strategy_params or {})
                fallback_params.pop("user_tmdb_ids", None)
                # yield from is required here — in a generator, return <value>
                # does NOT delegate to the recursive generator
                yield from self.get_recommendations_stream(
                    movies, count, strategy, fallback_params if fallback_params else None,
                    watched_titles=watched_titles,
                    taste_analysis=taste_analysis,
                    previous_feedback=previous_feedback,
                    excluded_tmdb_ids=excluded_tmdb_ids,
                    lang=lang,
                    rag_context=rag_context,
                )
                return

        # ── Standard AI-only path (fallback) ────────────────────────
        max_retries = min(max(3, count), MAX_API_RETRIES)  # Dynamic but capped
        temperature = STRATEGY_TEMPERATURES.get(strategy, DEFAULT_TEMPERATURE)
        all_excluded = list(watched_titles or [])
        all_recs: list[dict] = []
        total_filtered = 0
        filtered_titles_info: list[tuple[str, str]] | None = None

        # Yield start event
        start_data = json.dumps({"model": self.model_type, "source_count": len(movies)})
        yield f"event: start\ndata: {start_data}\n\n"

        for attempt in range(max_retries):
            remaining = count - len(all_recs)
            if remaining <= 0:
                break

            # Scale up request on retry to compensate for filtering losses
            request_count = min(remaining * 2, 10) if attempt > 0 else remaining

            prompt = self._build_prompt(
                movies, request_count, strategy, strategy_params,
                watched_titles=all_excluded, taste_analysis=taste_analysis,
                exclude_titles=all_excluded,
                retry_attempt=attempt,
                previous_feedback=previous_feedback,
                filtered_titles_info=filtered_titles_info,
                lang=lang,
                rag_context=rag_context,
            )

            # SSE stream from AI
            try:
                stream = self._create_chat(
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT_RECOMMEND},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=temperature,
                    max_tokens=MAX_TOKENS,
                    timeout=60,
                    stream=True,
                )
            except AuthenticationError:
                yield f"event: error\ndata: {json.dumps({'message': f'Authentication failed for {self.model_type}. Please check your API key.'})}\n\n"
                return
            except RateLimitError:
                yield f"event: error\ndata: {json.dumps({'message': f'Rate limit exceeded for {self.model_type}. Please try again later.'})}\n\n"
                return
            except APITimeoutError:
                yield f"event: error\ndata: {json.dumps({'message': f'Request to {self.model_type} timed out. Please try again.'})}\n\n"
                return
            except APIConnectionError:
                yield f"event: error\ndata: {json.dumps({'message': f'无法连接到 {self.model_type} API，请检查网络连接和 API 地址配置'})}\n\n"
                return
            except APIError as e:
                code = getattr(e, "status_code", "unknown")
                yield f"event: error\ndata: {json.dumps({'message': f'{self.model_type} API error ({code}): {e.message}'})}\n\n"
                return

            accumulated = ""

            for chunk in stream:
                # Some gateways send chunks with empty choices (e.g. a final
                # chunk carrying only usage/finish info) — skip them.
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    token = delta.content
                    accumulated += token
                    # Forward chunk events so the frontend can show progress
                    yield f"event: chunk\ndata: {json.dumps({'text': token})}\n\n"

            # Empty output (reasoning model produced no content) → retry the
            # attempt instead of failing the whole stream.
            if not accumulated.strip():
                if attempt == 0:
                    logger.warning("Empty streamed output from %s on first attempt, retrying", self.model_type)
                continue

            # Parse and filter this attempt's results
            try:
                json_str = self._extract_json(accumulated)
                data = json.loads(json_str)
                new_recs = data.get("recommendations", [])
            except (json.JSONDecodeError, ValueError):
                if attempt == 0:
                    error_data = json.dumps({"message": f"Failed to parse AI response: {accumulated[:200]}"})
                    yield f"event: error\ndata: {error_data}\n\n"
                    return
                break

            if not new_recs:
                continue

            # Re-check against all_excluded (which now includes previous retry AI suggestions)
            before = list(new_recs)
            new_recs = self._filter_watched(new_recs, all_excluded)
            filtered_out = _get_filtered_out(before, new_recs)
            total_filtered += len(filtered_out)

            filtered_titles_info = None
            if filtered_out:
                filtered_titles_info = [
                    (_get_title(r), "已在用户的已看/想看列表中")
                    for r in filtered_out
                ]

            if not new_recs:
                continue

            all_recs.extend(new_recs)
            for r in new_recs:
                t = _get_title(r)
                if t and t not in all_excluded:
                    all_excluded.append(t)

        if total_filtered > 0:
            logger.info(
                "[Recommend] Filtered out %d already-watched titles (%d/%d final)",
                total_filtered, len(all_recs[:count]), count,
            )

        # Resolve poster URLs + TMDB IDs from TMDB, then filter by excluded IDs
        all_recs = self._resolve_metadata(all_recs)
        all_recs = self._filter_by_tmdb_id(all_recs, excluded_tmdb_ids)

        # Yield each recommendation as SSE event
        for rec in all_recs[:count]:
            rec_data = json.dumps({
                "title": rec.get("title", "") if isinstance(rec, dict) else rec.title,
                "year": rec.get("year") if isinstance(rec, dict) else rec.year,
                "genre": rec.get("genre") if isinstance(rec, dict) else rec.genre,
                "reason": rec.get("reason", "") if isinstance(rec, dict) else rec.reason,
                "confidence": rec.get("confidence", 0.5) if isinstance(rec, dict) else rec.confidence,
                "poster_url": rec.get("poster_url") if isinstance(rec, dict) else rec.poster_url,
                "tmdb_id": rec.get("tmdb_id") if isinstance(rec, dict) else rec.tmdb_id,
                "media_type": rec.get("media_type") if isinstance(rec, dict) else rec.media_type,
            }, ensure_ascii=False)
            yield f"event: recommendation\ndata: {rec_data}\n\n"

        # Yield done event
        done_data = json.dumps({
            "model_used": self.model_type,
            "source_count": len(movies),
            "total": len(all_recs[:count]),
            "filtered_count": total_filtered,
        })
        yield f"event: done\ndata: {done_data}\n\n"

    # ── Parsing (formerly parsing.ParsingMixin) ──────────────────────

    def _extract_json(self, content: str) -> str:
        """Extract JSON from AI response, handling markdown code blocks, think blocks, and extraneous text.

        Uses ``json.JSONDecoder.raw_decode`` instead of manual brace counting
        so braces inside string values (e.g. a reason like "类似{高分}的神作")
        are correctly ignored.  Also strips ``<think>...</think>`` blocks that
        DeepSeek reasoning models emit around their chain of thought.
        """
        if not content or not content.strip():
            raise ValueError("No valid JSON object found in AI response")

        # Try to extract content from markdown code blocks first
        block_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
        if block_match:
            content = block_match.group(1).strip()

        # Strip <think>...</think> reasoning blocks (DeepSeek V4 thinking mode).
        # Unclosed blocks (truncated output) are stripped to end-of-string too,
        # since any JSON would come after the reasoning, not inside it.
        content = re.sub(r"<think>[\s\S]*?(?:</think>|$)", "", content)

        decoder = json.JSONDecoder()
        for i, ch in enumerate(content):
            if ch not in ("{", "["):
                continue
            try:
                _, end = decoder.raw_decode(content[i:])
            except json.JSONDecodeError:
                continue
            return content[i:i + end]

        raise ValueError("No valid JSON object found in AI response")


    def _parse_response(self, content: str) -> list[MediaRecommendation]:
        """Parse the AI response into structured recommendations."""
        json_str = self._extract_json(content)

        try:
            data = json.loads(json_str)
        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse AI response as JSON: {e}")

        # Accept either {"recommendations": [...]} or a bare [...] array
        # (some models emit the array directly).
        if isinstance(data, list):
            recs = data
        else:
            recs = data.get("recommendations", [])
        if not recs:
            raise ValueError("No recommendations found in AI response")

        return [
            MediaRecommendation(
                title=r.get("title", "Unknown"),
                year=r.get("year"),
                genre=r.get("genre"),
                reason=r.get("reason", ""),
                confidence=min(max(float(r.get("confidence", 0.5)), 0.0), 1.0),
                media_type=r.get("media_type"),
            )
            for r in recs
        ]

    # ── Taste analysis (formerly taste.TasteMixin) ───────────────────

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

    # ── Filtering (formerly filters.FilterMixin) ──────────────────────

    @staticmethod
    def _resolve_metadata(recs: list) -> list:
        """Search TMDB for each recommendation's poster URL + TMDB ID (parallel).

        Works with both ``list[MediaRecommendation]`` and ``list[dict]``.
        If TMDB is not configured, returns recs unchanged.
        Attaches ``poster_url`` and ``tmdb_id`` to each recommendation
        from the TMDB search results (``source_id`` field).

        **TMDB API optimization:**
        Searches with ``media_type="movie"`` first (covers most AI
        recommendations). If no poster is found, falls back to
        ``media_type="tv"`` for the specific title — avoiding the
        wasteful double-search of both endpoints for every rec.
        """
        tmdb_key = get_config_api_key("tmdb")
        if not tmdb_key or not recs:
            return recs

        from concurrent.futures import ThreadPoolExecutor

        is_dict = isinstance(recs[0], dict)

        def set_field(rec, key, value):
            if is_dict:
                rec[key] = value
            else:
                setattr(rec, key, value)

        def resolve_one(rec):
            title = rec.get("title", "") if is_dict else getattr(rec, "title", "")
            year = rec.get("year") if is_dict else getattr(rec, "year", None)
            if not title:
                return

            # ── Skip if already has TMDB metadata ─────────────────────
            # TMDB hybrid path already attaches tmdb_id + poster_url;
            # pure AI path may also have some recs with existing metadata
            # from earlier retries or from future code paths.
            existing_tmdb_id = rec.get("tmdb_id", "") if is_dict else getattr(rec, "tmdb_id", "")
            existing_poster = rec.get("poster_url", "") if is_dict else getattr(rec, "poster_url", "")
            if existing_tmdb_id and existing_poster:
                return

            try:
                # Step 1: Search movies only (covers vast majority of AI recommendations)
                results = search_external_movies(title, "tmdb", media_type="movie")
                if results:
                    year_match = next(
                        (r for r in results if r.get("year") == year and r.get("poster_url")),
                        None,
                    )
                    fallback = next((r for r in results if r.get("poster_url")), None)
                    match = year_match or fallback or results[0]
                    poster_url = match.get("poster_url")
                    source_id = match.get("source_id")
                    if poster_url:
                        set_field(rec, "poster_url", poster_url)
                        set_field(rec, "tmdb_id", source_id)
                        set_field(rec, "media_type", "movie")
                        return

                # Step 2: Fallback — if movie search didn't find anything, try TV
                tv_results = search_external_movies(title, "tmdb", media_type="tv")
                if tv_results:
                    year_match = next(
                        (r for r in tv_results if r.get("year") == year and r.get("poster_url")),
                        None,
                    )
                    fallback = next((r for r in tv_results if r.get("poster_url")), None)
                    match = year_match or fallback or tv_results[0]
                    poster_url = match.get("poster_url")
                    source_id = match.get("source_id")
                    if poster_url:
                        set_field(rec, "poster_url", poster_url)
                        set_field(rec, "tmdb_id", source_id)
                        set_field(rec, "media_type", "tv")
            except Exception:
                pass

        with ThreadPoolExecutor(max_workers=5) as pool:
            list(pool.map(resolve_one, recs))

        return recs


    @staticmethod
    def _filter_by_tmdb_id(recs: list, excluded_tmdb_ids: set[str] | None) -> list:
        """Filter out recommendations whose TMDB ID is in the excluded set.

        Runs **after** ``_resolve_metadata()`` has attached ``tmdb_id`` to
        each rec.  Catches cross-language duplicates (e.g. "Inception" vs
        "盗梦空间") that title-based fuzzy matching cannot handle.

        Works with both ``list[MediaRecommendation]`` and ``list[dict]``.
        Items without a TMDB ID are kept as-is (title-based fallback).
        """
        if not excluded_tmdb_ids:
            return recs

        is_dict = isinstance(recs[0], dict) if recs else False
        filtered = []
        for rec in recs:
            tmdb_id = rec.get("tmdb_id", "") if is_dict else getattr(rec, "tmdb_id", "")
            if tmdb_id and tmdb_id in excluded_tmdb_ids:
                title = rec.get("title", "") if is_dict else getattr(rec, "title", "")
                logger.info("[TMDB-ID] FILTERED OUT: '%s' (tmdb_id=%s)", title, tmdb_id)
                continue
            filtered.append(rec)
        return filtered


    @staticmethod
    def _filter_watched(recs: list, watched_titles: Optional[list[str]]) -> list:
        """Filter out recommendations that the user has already watched.

        Uses fuzzy title matching with Jaccard word-set similarity to
        catch duplicates across Unicode variants (Amélie → Amelie),
        punctuation differences, and formatting variations — while
        avoiding false positives for different franchise entries
        (e.g. "Batman" vs "Batman Begins").

        Matching strategy:
        - 1.00: Exact match (after normalize/lowercase/strip)
        - 0.90: Unicode-normalized + punctuation-stripped match
        - 0.00–1.00: Jaccard similarity of meaningful word sets

        Threshold: >= 0.70 is considered a match.

        Works with both MediaRecommendation objects and raw dicts.
        Handles None input gracefully.
        """
        if not watched_titles:
            return recs
        watched_clean = [t for t in watched_titles if t]
        if not watched_clean:
            return recs

        MATCH_THRESHOLD = 0.70

        def _match_score(a: str, b: str) -> float:
            """Jaccard-based similarity sans substring match.

            For CJK text where word-level Jaccard fails due to lack of
            whitespace (e.g. "荒蛮故事" vs "蛮荒故事"), falls back to
            character-level Jaccard — comparing the set of unique CJK
            characters rather than words.
            """
            a_norm = normalize(a)
            b_norm = normalize(b)
            if not a_norm or not b_norm:
                return 0.0
            if a_norm == b_norm:
                return 1.0
            a_clean = remove_special_chars(normalize_unicode(a_norm))
            b_clean = remove_special_chars(normalize_unicode(b_norm))
            if a_clean and b_clean and a_clean == b_clean:
                return 0.9
            words_a = title_words(a_norm)
            words_b = title_words(b_norm)
            word_jaccard = 0.0
            if words_a and words_b:
                intersection = words_a & words_b
                union = words_a | words_b
                word_jaccard = len(intersection) / len(union)

            # CJK character-level fallback: if both strings contain CJK
            # and word Jaccard is below threshold, compare by character
            # set.  Catches swapped-word-order cases like "荒蛮故事" vs
            # "蛮荒故事" (same 4 characters, different ordering).
            if word_jaccard < 0.70 and (has_cjk(a_norm) or has_cjk(b_norm)):
                chars_a = set(a_norm.replace(" ", ""))
                chars_b = set(b_norm.replace(" ", ""))
                if chars_a and chars_b:
                    # Require similar character set size to prevent
                    # matching different movies that happen to share
                    # common characters (e.g. "我和我的祖国" vs "我的祖国").
                    size_ratio = min(len(chars_a), len(chars_b)) / max(len(chars_a), len(chars_b))
                    if size_ratio < 0.80:
                        return word_jaccard
                    char_intersection = chars_a & chars_b
                    char_union = chars_a | chars_b
                    char_jaccard = len(char_intersection) / len(char_union)
                    return max(word_jaccard, char_jaccard)

            return word_jaccard

        def _is_watched(title: str) -> bool:
            """Check if a title matches any watched title using local fuzzy matching.

            Uses ``_match_score`` (Jaccard word similarity with CJK character
            fallback) — no external API calls.  Works for same-language
            comparisons (CJK↔CJK, EN↔EN).  Does NOT handle cross-language
            matching (e.g. "Inception" vs "盗梦空间") — those will not be
            detected as duplicates without a TMDB-based resolution step.
            """
            return any(_match_score(title, wt) >= MATCH_THRESHOLD for wt in watched_clean)

        # Track what's being filtered for debugging
        filtered = []
        for r in recs:
            title = r.get("title", "") if isinstance(r, dict) else getattr(r, "title", "")
            if not title:
                filtered.append(r)
                continue
            is_watched = _is_watched(title)
            if not is_watched:
                filtered.append(r)
            else:
                logger.info("[FilterDebug] FILTERED OUT (watched): '%s'", title)

        # Also deduplicate within the same batch — AI sometimes returns the same
        # movie twice in one response (exact title or fuzzy match).
        # Uses the same local ``_match_score``, no TMDB calls.
        seen_titles: list[str] = []
        deduped = []
        for r in filtered:
            title = r.get("title", "") if isinstance(r, dict) else getattr(r, "title", "")
            if not title:
                deduped.append(r)
                continue
            is_dup = any(_match_score(title, st) >= MATCH_THRESHOLD for st in seen_titles)
            if is_dup:
                logger.info("[FilterDebug] FILTERED OUT (duplicate in batch): '%s'", title)
                continue
            seen_titles.append(title)
            deduped.append(r)

        return deduped


# Backwards-compatible class-name aliases.  The three former thin mixins were
# merged into RecommendMixin above; these names remain importable for any code
# that referenced the old classes.  They are aliases, not distinct bases.
ParsingMixin = RecommendMixin
TasteMixin = RecommendMixin
FilterMixin = RecommendMixin
