"""Recommendation sessions: one deep module behind a small interface.

A *recommendation session* is the act of generating recommendations, framing
them as Server-Sent Events, and persisting the result so it shows up in the
user's history.  Before this module that concept was scattered across three
near-identical ``_stream_*_with_persistence`` wrappers in the router, each
re-implementing the same SSE parsing, confidence clamping, and session save
(and each reaching into a private ``AIService._analyze_user_taste`` method).

Here all of that lives once.  Routers call one of three small generators —
:func:`stream_recommendations`, :func:`stream_local_recommendations`, or
:func:`stream_followup` — and supply a *strategy adapter* (``Source``) for the
part that genuinely varies (which AIService method produces the raw events).
The interface is the test surface: a fake ``Source`` yielding canned events is
enough to test framing and persistence without any AI key or database.
"""

import json
import logging
from typing import Callable, Iterator, Optional, Protocol

from ai_service import AIService
from config_manager import get_api_key as get_config_api_key
from crud import save_session as db_save_session
from database import get_user_session
from models import MediaRating, MediaRecommendation

logger = logging.getLogger(__name__)

# ``model_used`` value for the no-AI-key local (TMDB-only) path
LOCAL_MODEL = "local"


def resolve_model(request_model: str) -> tuple[str, str]:
    """Resolve which model + API key to actually use.

    - ``local`` → local TMDB-only recommendations (no AI key needed)
    - ``ollama`` → local key-less model (placeholder key)
    - configured model → (model, key)
    - requested model without a key → falls back to local TMDB recs
    """
    from ai_service.constants import MODEL_CONFIGS

    if request_model == LOCAL_MODEL:
        return LOCAL_MODEL, ""
    config = MODEL_CONFIGS.get(request_model)
    if not config:
        return LOCAL_MODEL, ""
    if config.get("requires_key") is False:
        return request_model, config.get("placeholder_key", "ollama")
    key = get_config_api_key(request_model)
    if key:
        return request_model, key
    return LOCAL_MODEL, ""


# ── Internal helpers (one copy each) ───────────────────────────────────


def _build_rag_query(movies: list[MediaRating], strategy: str) -> str:
    """Build a semantically meaningful retrieval query from real taste data."""
    import re
    from collections import Counter

    high_rated = [m for m in movies if m.rating and m.rating >= 7.0]

    genre_counter: Counter = Counter()
    for m in high_rated:
        if m.genre:
            for g in re.split(r"\s*/\s*", m.genre):
                g = g.strip()
                if g:
                    genre_counter[g] += int(m.rating)
    top_genres = [g for g, _ in genre_counter.most_common(5)]

    top_titles = [
        m.title for m in sorted(high_rated, key=lambda m: m.rating or 0, reverse=True)[:5]
        if m.title
    ]

    parts = []
    if top_genres:
        parts.append("、".join(top_genres))
    if top_titles:
        parts.append("、".join(top_titles))

    return " ".join(parts) or strategy


def retrieve_rag_context(user_id: int, movies: list[MediaRating], strategy: str, lang: Optional[str] = None):
    """Public seam to RAG context retrieval for the synchronous endpoint.

    Streams call this internally; only the synchronous ``/recommend`` endpoint
    needs it directly.  Keeping it here means the router owns no retrieval
    logic at all.
    """
    try:
        from ai_service.rag import get_rag_context_cached
        from sqlmodel import select
        from models import UserPreferencesRecord

        user_session = get_user_session(user_id)
        try:
            prefs = user_session.exec(
                select(UserPreferencesRecord).where(UserPreferencesRecord.user_id == user_id)
            ).first()
            if prefs and not prefs.rag_enabled:
                return None

            query = _build_rag_query(movies, strategy)
            return get_rag_context_cached(
                user_id=user_id,
                query=query,
                strategy=strategy,
                count=5,
                db=user_session,
            )
        finally:
            user_session.close()
    except Exception as e:
        logger.debug("RAG retrieval skipped for user %d: %s", user_id, e)
        return None


def _extract_watched_titles(movies: list[MediaRating]) -> list[str]:
    """Extract watched movie titles from the movie list."""
    return [m.title for m in movies if m.title]


def _clamp_confidence(r: dict) -> float:
    """Coerce an LLM-supplied confidence into [0.0, 1.0]."""
    return min(max(float(r.get("confidence", 0.5)), 0.0), 1.0)


def _to_model(r: dict) -> MediaRecommendation:
    """Build a persisted MediaRecommendation from a raw event payload."""
    return MediaRecommendation(
        title=r.get("title", "Unknown"),
        year=r.get("year"),
        genre=r.get("genre"),
        reason=r.get("reason", ""),
        confidence=_clamp_confidence(r),
        tmdb_id=r.get("tmdb_id"),
        media_type=r.get("media_type"),
    )


def _event_payload(event: str, prefix: str) -> Optional[str]:
    """Return the first ``data: `` payload of an SSE frame, if present."""
    for line in event.split("\n"):
        if line.startswith("data: "):
            return line[6:].strip()
    return None


def _save_session(user_id: int, model: str, movies: list, rec_models: list, label: str) -> None:
    """Persist a recommendation session with its own (stream-scoped) DB session.

    Streaming responses outlive the request-scoped session, so we must open
    and close our own.  Failures are logged but never break the stream.
    """
    if not rec_models:
        return
    try:
        user_session = get_user_session(user_id)
        try:
            db_save_session(
                model=model,
                source_count=len(movies),
                movies=movies,
                recommendations=rec_models,
                user_id=user_id,
                db=user_session,
            )
        finally:
            user_session.close()
    except Exception as e:
        logger.warning("Error saving %s session: %s", label, e)


def _make_service(model: str, api_key: str, user_id: int) -> AIService:
    """Build the AIService for a real (non-fake) source."""
    return AIService(
        api_key=api_key,
        model_type=model if model != LOCAL_MODEL else "deepseek",
        user_id=user_id,
    )


def save_recommendation_session(
    *, model: str, source_count: int, movies: list,
    recommendations: list, user_id: int, db,
) -> None:
    """Persist pre-built recommendations to a caller-owned DB session.

    The synchronous endpoint already has a request-scoped ``db``, so it passes
    it in; failures are logged but never surface as a 502.  This keeps save
    semantics in this module alongside the streaming path's
    :func:`_save_session`.
    """
    if not recommendations:
        return
    try:
        db_save_session(
            model=model,
            source_count=source_count,
            movies=movies,
            recommendations=recommendations,
            user_id=user_id,
            db=db,
        )
    except Exception as e:
        logger.warning("Error saving session (sync): %s", e)


# ── Strategy adapters: the only part that varies per path ──────────────


class Source(Protocol):
    """Adapter interface: yields SSE-formatted events for one session."""

    def __call__(self) -> Iterator[str]: ...


def _ai_stream_source(
    movies: list, count: int, model: str, api_key: str, user_id: int,
    strategy: str, strategy_params: Optional[dict], watched_titles: Optional[list[str]],
    previous_feedback: Optional[dict], excluded_tmdb_ids: Optional[set[str]], lang: Optional[str],
) -> Source:
    """Build the source for AI-backed streaming recommendations."""
    service = _make_service(model, api_key, user_id)
    taste = service.analyze_user_taste(movies)
    watched = watched_titles or _extract_watched_titles(movies)
    rag_context = retrieve_rag_context(user_id, movies, strategy, lang)

    def source() -> Iterator[str]:
        yield from service.get_recommendations_stream(
            movies, count, strategy, strategy_params,
            watched_titles=watched,
            taste_analysis=taste,
            previous_feedback=previous_feedback,
            excluded_tmdb_ids=excluded_tmdb_ids,
            lang=lang,
            rag_context=rag_context,
        )

    return source


def _local_stream_source(
    movies: list, count: int, user_id: int, strategy: str,
    strategy_params: Optional[dict], excluded_tmdb_ids: Optional[set[str]], lang: Optional[str],
) -> Callable[[], tuple[list, object]]:
    """Build the source for the no-AI-key local (TMDB-only) path.

    Returns a zero-arg callable producing ``(recs, service)`` so the framing
    loop can use each ``MediaRecommendation`` directly (it already carries a
    validated confidence, no clamp needed).
    """
    service = _make_service(LOCAL_MODEL, "", user_id)
    taste = service.analyze_user_taste(movies)

    def source() -> tuple[list, AIService]:
        recs = service.get_local_recommendations(
            movies, count, strategy, strategy_params,
            taste_analysis=taste,
            user_tmdb_ids=(strategy_params or {}).get("user_tmdb_ids"),
            excluded_tmdb_ids=excluded_tmdb_ids,
            lang=lang,
        )
        return recs, service

    return source


def _followup_stream_source(
    movies: list, count: int, model: str, api_key: str, user_id: int,
    watched_titles: Optional[list[str]], excluded_tmdb_ids: Optional[set[str]],
    previous_recommendations: Optional[list], conversation: Optional[list],
    question: str, lang: Optional[str],
) -> Source:
    """Build the source for follow-up conversation recommendations."""
    service = _make_service(model, api_key, user_id)
    taste = service.analyze_user_taste(movies)
    watched = watched_titles or _extract_watched_titles(movies)
    rag_context = retrieve_rag_context(user_id, movies, "taste", lang)

    def source() -> Iterator[str]:
        yield from service.get_followup_stream(
            movies=movies,
            previous_recommendations=previous_recommendations or [],
            conversation=conversation or [],
            question=question,
            count=count,
            watched_titles=watched,
            taste_analysis=taste,
            excluded_tmdb_ids=excluded_tmdb_ids,
            lang=lang,
            rag_context=rag_context,
        )

    return source


# ── Public interface: three generators, one framing/persistence core ───


def _stream_from_source(
    source: Source, user_id: int, model: str, movies: list,
    *, result_event: str = "recommendation", label: str = "",
) -> Iterator[str]:
    """Frame raw events, collect recommendation payloads, then persist once.

    This is the single copy of the SSE framing + clamp + save logic that used
    to appear three times in the router.  ``result_event`` selects which event
    kind carries the recommendation payload (``recommendation`` for the
    standard streams, ``result`` for follow-up chat).
    """
    recommendations_cache: list[dict] = []

    for event in source():
        if event.startswith(f"event: {result_event}"):
            payload = _event_payload(event, result_event)
            if payload:
                try:
                    data = json.loads(payload)
                    recs = (
                        data.get("recommendations", [])
                        if result_event == "result" and isinstance(data, dict)
                        and data.get("type") == "recommendations"
                        else [data] if result_event == "recommendation"
                        else []
                    )
                    for r in recs:
                        if isinstance(r, dict):
                            recommendations_cache.append(r)
                except json.JSONDecodeError:
                    pass
        yield event

    try:
        rec_models = [_to_model(r) for r in recommendations_cache]
    except Exception as e:
        logger.warning("Error building recommendation models: %s", e)
        rec_models = []
    _save_session(user_id, model, movies, rec_models, label or result_event)


def stream_recommendations(
    movies: list, count: int, model: str, api_key: str, user_id: int,
    *, strategy: str = "taste", strategy_params: Optional[dict] = None,
    watched_titles: Optional[list[str]] = None, previous_feedback: Optional[dict] = None,
    excluded_tmdb_ids: Optional[set[str]] = None, lang: Optional[str] = None,
    source: Optional[Source] = None,
) -> Iterator[str]:
    """Generate + persist an AI-backed recommendation session (streamed).

    ``source`` is an optional adapter for tests; when omitted the real
    AIService-backed source is used.  Nothing about the SSE protocol or the
    persistence step leaks into callers.
    """
    src = source or _ai_stream_source(
        movies, count, model, api_key, user_id, strategy, strategy_params,
        watched_titles, previous_feedback, excluded_tmdb_ids, lang,
    )
    yield from _stream_from_source(src, user_id, model, movies)


def stream_followup(
    movies: list, count: int, model: str, api_key: str, user_id: int,
    *, watched_titles: Optional[list[str]] = None,
    excluded_tmdb_ids: Optional[set[str]] = None,
    previous_recommendations: Optional[list] = None,
    conversation: Optional[list] = None, question: str = "", lang: Optional[str] = None,
    source: Optional[Source] = None,
) -> Iterator[str]:
    """Generate + persist a follow-up recommendation session (streamed)."""
    src = source or _followup_stream_source(
        movies, count, model, api_key, user_id, watched_titles,
        excluded_tmdb_ids, previous_recommendations, conversation, question, lang,
    )
    yield from _stream_from_source(src, user_id, model, movies, result_event="result", label="follow-up")


def stream_local_recommendations(
    movies: list, count: int, user_id: int,
    *, strategy: str = "taste", strategy_params: Optional[dict] = None,
    excluded_tmdb_ids: Optional[set[str]] = None, lang: Optional[str] = None,
    source: Optional[Callable[[], tuple[list, object]]] = None,
) -> Iterator[str]:
    """Generate + persist a local (TMDB-only, no AI key) session (streamed).

    The local path emits its own SSE frames (it has no AIService generator),
    so framing and persistence both live here in one place.
    """
    getter = source or _local_stream_source(
        movies, count, user_id, strategy, strategy_params, excluded_tmdb_ids, lang,
    )
    try:
        recs, _ = getter()
    except ValueError as e:
        yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
        return

    start_data = json.dumps({"model": LOCAL_MODEL, "source_count": len(movies)})
    yield f"event: start\ndata: {start_data}\n\n"

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
        }, ensure_ascii=False)
        yield f"event: recommendation\ndata: {rec_data}\n\n"

    done_data = json.dumps({
        "model_used": LOCAL_MODEL,
        "source_count": len(movies),
        "total": len(recs),
        "filtered_count": 0,
    })
    yield f"event: done\ndata: {done_data}\n\n"

    if recs:
        try:
            rec_models = [
                MediaRecommendation(
                    title=r.title, year=r.year, genre=r.genre, reason=r.reason,
                    confidence=r.confidence, tmdb_id=r.tmdb_id, media_type=r.media_type,
                )
                for r in recs
            ]
        except Exception as e:
            logger.warning("Error building local recommendation models: %s", e)
            rec_models = []
        _save_session(user_id, LOCAL_MODEL, movies, rec_models, "local")
