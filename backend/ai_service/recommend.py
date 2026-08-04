"""Recommendation entry points: sync, follow-up, and streaming generation."""

import json
from typing import Optional

from openai import APIConnectionError, APIError, APITimeoutError, AuthenticationError, RateLimitError
from models import MediaRating, MediaRecommendation

from .constants import (
    DEFAULT_TEMPERATURE,
    MAX_API_RETRIES,
    MAX_TOKENS,
    STRATEGY_TEMPERATURES,
    SYSTEM_PROMPT_FOLLOWUP,
    SYSTEM_PROMPT_RECOMMEND,
    TMDB_SKIP_STRATEGIES,
    _get_filtered_out,
    _get_title,
    logger,
)


class RecommendMixin:
    """Recommendation entry points: sync, follow-up, and streaming generation."""

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
    ) -> tuple[list, int]:
        """Shared retry loop for the pure-AI recommendation path.

        ``call_ai(prompt, attempt)`` receives the prompt string and attempt
        number, and returns either a list of parsed recommendations (dicts
        or ``MediaRecommendation`` objects) or ``None`` to break the loop.
        The callback must handle its own exceptions.  Returning ``None``
        silently breaks the loop without raising.

        Returns ``(all_recs, total_filtered)``.
        """
        max_retries = min(max(3, count), MAX_API_RETRIES)
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
            print(f"[Recommend] Filtered out {total_filtered} already-watched titles "
                  f"({len(all_recs[:count])}/{count} final)")

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

            content = response.choices[0].message.content
            if not content:
                if attempt == 0:
                    raise ValueError("Empty response from AI model")
                return None

            try:
                return self._parse_response(content)
            except ValueError:
                if attempt == 0:
                    raise
                return None  # Break retry loop, keep partial results

        all_recs, _ = self._retry_loop(
            movies, count, strategy, strategy_params,
            all_excluded, taste_analysis, previous_feedback,
            _sync_call_ai, lang=lang,
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
                watched_titles=all_excluded,
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
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    token = delta.content
                    accumulated += token
                    # Forward chunk events so the frontend can show progress
                    yield f"event: chunk\ndata: {json.dumps({'text': token})}\n\n"

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
