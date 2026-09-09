"""RAG retriever — fetches relevant user context for recommendations.

Combines dense vector search (semantic similarity), sparse search (keyword
matching), and memory retrieval into a single context package that the LLM
uses to generate personalized recommendations.

Supports:
- **Dense search**: BGE-M3 semantic similarity on movie embeddings
- **Sparse search**: keyword精确匹配 via BGE-M3 sparse vectors (when available)
- **Hybrid ranking**: weighted combination of dense + sparse scores
- **Anti-preference filtering**: exclude candidates matching low-rated genres
- **Memory search**: semantic search on user taste memories
- **Profile fetch**: structured taste profile from DB
"""

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
from sqlmodel import Session, func, select

from models import MovieEmbeddingRecord, UserMemoryRecord, UserProfileRecord

from .embedding import (
    EMBEDDING_DIMENSIONS,
    EmbeddingPipeline,
    build_movie_embedding_text,
    build_query_embedding_text,
    cosine_similarity,
    sparse_dot_product,
)

logger = logging.getLogger(__name__)

# Cache TTLs
_RAG_CACHE_TTL = 300  # 5 minutes
_RAG_CACHE_MAX_SIZE = 512
_rag_cache: dict[str, tuple[float, "RetrievalResult"]] = {}

# Vectorized dense-matrix cache: user_id → (loaded_at, updated_at, ids, titles,
# metas, matrix). Avoids re-parsing every 1024-dim JSON vector on each request.
# Invalidate by comparing max(updated_at) against the cached updated_at.
_VECTOR_CACHE_TTL = 300  # 5 minutes
_vector_cache: dict[int, tuple[float, float, list, list, list, "np.ndarray"]] = {}

# Chinese ↔ English genre translation for anti-preference matching.
# TMDB stores English genres ("Drama/Thriller") while the LLM-generated
# profile may contain Chinese anti-preferences ("闹剧喜剧").
_GENRE_TRANSLATION = {
    "动作": "action", "冒险": "adventure", "动画": "animation", "喜剧": "comedy",
    "犯罪": "crime", "纪录片": "documentary", "剧情": "drama", "家庭": "family",
    "奇幻": "fantasy", "历史": "history", "恐怖": "horror", "音乐": "music",
    "悬疑": "mystery", "爱情": "romance", "科幻": "science fiction", "科幻片": "science fiction",
    "电视电影": "tv movie", "惊悚": "thriller", "战争": "war", "西部": "western",
    "闹剧喜剧": "comedy", "闹剧": "comedy", "青春爱情": "romance", "爱情片": "romance",
}


def _genre_to_english(genre: str) -> set[str]:
    """Translate a genre string (possibly Chinese) to its English equivalents."""
    g = genre.strip().lower()
    if not g:
        return set()
    translated = _GENRE_TRANSLATION.get(g)
    if translated:
        return {translated}
    return {g}


def invalidate_vector_cache(user_id: int) -> None:
    """Drop the vectorized matrix cache for a user (call after embedding writes)."""
    _vector_cache.pop(user_id, None)


def _get_vector_cache(user_id: int, db: Session):
    """Load the user's embeddings as a pre-normalized numpy matrix, cached.

    Returns a tuple ``(loaded_at, db_updated_at, ids, metas, sparse_docs,
    matrix)`` or ``None`` when the user has no embeddings.

    Cache invalidation: compares the DB's ``max(updated_at)`` against the
    timestamp stored at build time — new/updated embeddings trigger a
    rebuild. Entries older than ``_VECTOR_CACHE_TTL`` are also refreshed.
    """
    now = time.time()

    db_updated_at = db.exec(
        select(func.max(MovieEmbeddingRecord.updated_at))
        .where(MovieEmbeddingRecord.user_id == user_id)
    ).one()

    cached = _vector_cache.get(user_id)
    if cached:
        loaded_at, cached_updated_at, ids, metas, sparse_docs, matrix = cached
        if (now - loaded_at) < _VECTOR_CACHE_TTL and cached_updated_at == db_updated_at:
            return cached

    # (Re)build the matrix
    records = db.exec(
        select(MovieEmbeddingRecord).where(MovieEmbeddingRecord.user_id == user_id)
    ).all()
    if not records:
        _vector_cache.pop(user_id, None)
        return None

    ids: list[int] = []
    metas: list[dict] = []
    sparse_docs: list[Optional[dict]] = []
    vectors: list[list[float]] = []

    for r in records:
        try:
            vec = json.loads(r.embedding_dense)
        except (json.JSONDecodeError, ValueError, TypeError):
            continue
        if not vec or len(vec) != EMBEDDING_DIMENSIONS:
            continue
        ids.append(r.id)
        metas.append({
            "title": r.title,
            "year": r.year,
            "genre": r.genre,
            "rating": r.rating,
            "media_type": r.media_type,
            "tmdb_id": r.tmdb_id,
        })
        sd = None
        if r.embedding_sparse:
            try:
                sd = json.loads(r.embedding_sparse)
            except (json.JSONDecodeError, ValueError, TypeError):
                sd = None
        sparse_docs.append(sd)
        vectors.append(vec)

    if not vectors:
        return None

    matrix = np.asarray(vectors, dtype=np.float32)
    # Pre-normalize rows so dot product == cosine similarity at query time
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    matrix = matrix / norms

    entry = (now, db_updated_at, ids, metas, sparse_docs, matrix)
    _vector_cache[user_id] = entry
    return entry

# Hybrid retrieval weights per strategy
HYBRID_WEIGHTS = {
    "taste":    {"dense": 0.70, "sparse": 0.30},
    "classics": {"dense": 0.60, "sparse": 0.40},
    "mood":     {"dense": 0.75, "sparse": 0.25},
    "era":      {"dense": 0.55, "sparse": 0.45},
    "gems":     {"dense": 0.65, "sparse": 0.35},
    "explore":  {"dense": 0.70, "sparse": 0.30},
    "playlist": {"dense": 0.70, "sparse": 0.30},
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class RetrievalResult:
    """Packaged context for a single recommendation request."""

    semantic_candidates: list[dict] = field(default_factory=list)
    memories: list[dict] = field(default_factory=list)
    profile: Optional[dict] = None
    total_movies: int = 0
    retrieval_time_ms: float = 0.0
    sparse_used: bool = False
    anti_preference_filtered: int = 0

    def to_prompt_context(self) -> str:
        """Assemble retrieval results into an LLM-ready context block."""
        sections = []

        # 1. User taste profile (structured)
        if self.profile:
            def _fmt(value, joiner="、"):
                """Render list/dict/str values as readable text for the prompt."""
                if value is None:
                    return "未知"
                if isinstance(value, list):
                    return joiner.join(str(v) for v in value) if value else "未知"
                if isinstance(value, dict):
                    return joiner.join(f"{k}：{v}" for k, v in value.items()) if value else "未知"
                return str(value) or "未知"

            top_genres = self.profile.get("top_genres")
            if isinstance(top_genres, str) and top_genres.startswith("["):
                try:
                    top_genres = json.loads(top_genres)
                except (json.JSONDecodeError, ValueError):
                    pass
            sections.append(
                f"## 用户品味画像\n"
                f"核心偏好类型：{_fmt(top_genres)}\n"
                f"品味人格：{_fmt(self.profile.get('taste_personality'))}\n"
                f"评分习惯：{_fmt(self.profile.get('rating_patterns'))}\n"
                f"不喜欢：{_fmt(self.profile.get('anti_preferences'))}"
            )

        # 2. Natural language memories
        if self.memories:
            mem_lines = "\n".join(
                f"- [{m.get('type', '?')}] {m['text']}"
                for m in self.memories[:6]
            )
            sections.append(f"## 品味记忆（从观影历史中提取）\n{mem_lines}")

        # 3. Semantically similar movies from user's library
        if self.semantic_candidates:
            cand_lines = "\n".join(
                f"{i+1}. {c['title']} ({c.get('year', '?')}) [{c.get('genre', '?')}] "
                f"评分: {c['rating']}/10 相似度: {c['similarity']:.2f}"
                for i, c in enumerate(self.semantic_candidates[:15])
            )
            sections.append(f"## 与当前推荐最相关的观影历史\n{cand_lines}")

        # 4. Retrieval metadata
        parts = [f"基于 {self.total_movies} 部观影记录检索，耗时 {self.retrieval_time_ms:.0f}ms"]
        if self.sparse_used:
            parts.append("使用了关键词精确匹配")
        if self.anti_preference_filtered > 0:
            parts.append(f"已过滤 {self.anti_preference_filtered} 部不感兴趣类型的电影")
        sections.append("（" + "，".join(parts) + "）")

        return "\n\n".join(sections)


# ---------------------------------------------------------------------------
# RAG Retriever
# ---------------------------------------------------------------------------

class RAGRetriever:
    """Retrieves user context for recommendation generation.

    Retrieval stages:
    1. **Hybrid search** — dense (semantic) + sparse (keyword) on movie embeddings
    2. **Anti-preference filtering** — exclude low-rated genres
    3. **Memory search** — semantic search on user taste memories
    4. **Profile fetch** — structured taste profile from DB
    """

    def __init__(self, embedding_pipeline: EmbeddingPipeline = None):
        self.pipeline = embedding_pipeline or EmbeddingPipeline()

    def retrieve_context(
        self,
        user_id: int,
        query: str,
        strategy: str,
        count: int,
        db: Session,
    ) -> RetrievalResult:
        """Full RAG retrieval pipeline."""
        t0 = time.time()

        # Step 0: Fetch profile once (used by filtering + result packaging)
        profile = self._get_profile(user_id, db)

        # Step 1: Hybrid search (dense + sparse) on movie embeddings
        weights = HYBRID_WEIGHTS.get(strategy, HYBRID_WEIGHTS["taste"])
        semantic_candidates, sparse_used = self._hybrid_search(
            user_id, query, strategy, weights=weights, top_k=20, db=db,
        )

        # Step 2: Anti-preference filtering
        anti_filtered_count, semantic_candidates = self._filter_anti_preference(
            user_id, profile, semantic_candidates, db,
        )

        # Step 3: Retrieve relevant taste memories
        memories = self._retrieve_memories(user_id, query, top_k=6, db=db)

        # Step 4: Count total movies (cheap COUNT query, no row loading)
        total_count = db.exec(
            select(func.count(MovieEmbeddingRecord.id)).where(
                MovieEmbeddingRecord.user_id == user_id
            )
        ).one() or 0

        elapsed_ms = (time.time() - t0) * 1000

        result = RetrievalResult(
            semantic_candidates=semantic_candidates,
            memories=memories,
            profile=profile,
            total_movies=total_count,
            retrieval_time_ms=elapsed_ms,
            sparse_used=sparse_used,
            anti_preference_filtered=anti_filtered_count,
        )

        logger.info(
            "RAG retrieval: user=%d strategy=%s candidates=%d memories=%d "
            "sparse=%s anti_filtered=%d profile=%s (%.0fms)",
            user_id, strategy, len(semantic_candidates), len(memories),
            sparse_used, anti_filtered_count,
            "yes" if profile else "no", elapsed_ms,
        )
        return result

    # ── Internal retrieval methods ────────────────────────────────

    def _hybrid_search(
        self,
        user_id: int,
        query: str,
        strategy: str,
        weights: dict,
        top_k: int,
        db: Session,
    ) -> tuple[list[dict], bool]:
        """Hybrid search: dense (semantic) + sparse (keyword) scoring.

        Returns (results, sparse_was_used).
        """
        # Build query text
        query_text = build_query_embedding_text(query, strategy)

        # Embed query (dense + sparse)
        query_result = self.pipeline.embed_single(query_text)
        query_dense = query_result["dense"]
        query_sparse = query_result.get("sparse")
        has_sparse = query_sparse is not None

        if not query_dense:
            return [], False

        # Fetch user embeddings via the vectorized cache (avoids re-parsing
        # every 1024-dim JSON vector on each request)
        cache_entry = _get_vector_cache(user_id, db)
        if cache_entry is None:
            return [], False

        _loaded_at, _db_updated_at, _ids, metas, sparse_docs, matrix = cache_entry

        # Compute scores for each record
        dense_weight = weights.get("dense", 0.7)
        sparse_weight = weights.get("sparse", 0.3)

        # Normalize weights if sparse is unavailable
        if not has_sparse:
            dense_weight = 1.0
            sparse_weight = 0.0

        # Vectorized dense similarity: one matmul instead of per-row parsing
        query_vec = np.asarray(query_dense, dtype=np.float32)
        q_norm = np.linalg.norm(query_vec)
        if q_norm == 0:
            return [], False
        # Dimension mismatch (e.g. provider switch BGE-M3 1024-dim → OpenAI
        # 1536-dim): stored vectors are incompatible with the query. Fall
        # back to dense-only with per-row tolerance instead of crashing.
        if query_vec.shape[0] != matrix.shape[1]:
            logger.warning(
                "Embedding dimension mismatch: query=%d matrix=%d — skipping dense scores",
                query_vec.shape[0], matrix.shape[1],
            )
            dense_weight = 0.0
            sparse_weight = 1.0 if has_sparse else 0.0
            dense_scores = np.zeros(len(metas), dtype=np.float32)
        else:
            query_vec = query_vec / q_norm
            # Matrix rows are pre-normalized at cache build time → dot product = cosine
            dense_scores = matrix @ query_vec

        # Normalize sparse scores: raw dot products are unbounded (can be 10+)
        # while dense cosine is [-1, 1]. Scale by the query's total weight so
        # sparse scores land in [0, 1] and don't dominate the ranking.
        query_sparse_norm = 0.0
        if has_sparse and isinstance(query_sparse, dict):
            query_sparse_norm = sum(
                float(w) for w in query_sparse.values() if isinstance(w, (int, float))
            )

        results = []
        for i, meta in enumerate(metas):
            dense_score = float(dense_scores[i])

            # Sparse score (if available), normalized to [0, 1]
            sparse_score = 0.0
            if has_sparse and query_sparse_norm > 0 and sparse_docs[i] is not None:
                raw = sparse_dot_product(query_sparse, sparse_docs[i])
                sparse_score = max(0.0, min(1.0, raw / query_sparse_norm))

            # Weighted combination
            combined = dense_weight * dense_score + sparse_weight * sparse_score

            results.append({
                **meta,
                "similarity": round(combined, 4),
                "dense_score": round(dense_score, 4),
                "sparse_score": round(sparse_score, 4),
            })

        # Sort by combined similarity descending
        results.sort(key=lambda x: -x["similarity"])
        return results[:top_k], has_sparse

    def _filter_anti_preference(
        self,
        user_id: int,
        profile: Optional[dict],
        candidates: list[dict],
        db: Session,
    ) -> tuple[int, list[dict]]:
        """Filter out candidates that match anti-preference genres.

        Anti-preference genres are derived from:
        1. profile.anti_preferences (if set)
        2. genres of movies rated ≤ 4 by the user

        Returns (filtered_count, remaining_candidates).
        """
        if not candidates:
            return 0, candidates

        # Collect anti-preference genres from profile
        anti_genres = set()
        if profile:
            anti_prefs = profile.get("anti_preferences", "")
            if isinstance(anti_prefs, str) and anti_prefs:
                for g in anti_prefs.replace("、", ",").split(","):
                    g = g.strip()
                    if g:
                        anti_genres.add(g.lower())
            elif isinstance(anti_prefs, list):
                for g in anti_prefs:
                    if isinstance(g, str):
                        anti_genres.add(g.lower())

        # Also collect genres from low-rated movies (≤ 4)
        if not anti_genres:
            low_rated = db.exec(
                select(MovieEmbeddingRecord).where(
                    MovieEmbeddingRecord.user_id == user_id,
                    MovieEmbeddingRecord.rating <= 4.0,
                )
            ).all()
            genre_counter: dict[str, int] = {}
            for m in low_rated:
                if m.genre:
                    for g in m.genre.split("/"):
                        g = g.strip().lower()
                        if g:
                            genre_counter[g] = genre_counter.get(g, 0) + 1
            # Only use genres that appear in ≥ 2 low-rated movies
            anti_genres = {g for g, c in genre_counter.items() if c >= 2}

        if not anti_genres:
            return 0, candidates

        # Expand anti_genres with English translations so Chinese profile
        # entries can match English TMDB genre strings (and vice versa).
        anti_genres_expanded = set()
        for g in anti_genres:
            anti_genres_expanded.add(g)
            anti_genres_expanded.update(_genre_to_english(g))
        anti_genres = anti_genres_expanded

        filtered = []
        removed = 0
        for c in candidates:
            candidate_genres = set()
            if c.get("genre"):
                for g in c["genre"].split("/"):
                    candidate_genres.update(_genre_to_english(g))

            # Check overlap with anti-preference genres
            if candidate_genres & anti_genres:
                removed += 1
            else:
                filtered.append(c)

        return removed, filtered

    def _retrieve_memories(
        self,
        user_id: int,
        query: str,
        top_k: int,
        db: Session,
    ) -> list[dict]:
        """Semantic search on user taste memories."""
        # Fetch active memories
        memories = db.exec(
            select(UserMemoryRecord).where(
                UserMemoryRecord.user_id == user_id,
                UserMemoryRecord.is_active == True,  # noqa: E712
            )
        ).all()

        if not memories:
            return []

        # If memories have embeddings, do semantic search
        memories_with_emb = [m for m in memories if m.embedding]
        if memories_with_emb and query:
            query_result = self.pipeline.embed_single(query)
            query_dense = query_result["dense"]

            scored = []
            for m in memories_with_emb:
                try:
                    emb = json.loads(m.embedding)
                    sim = cosine_similarity(query_dense, emb)
                    scored.append((m, sim))
                except (json.JSONDecodeError, ValueError):
                    continue

            scored.sort(key=lambda x: -x[1])
            top_memories = [m for m, _ in scored[:top_k]]
        else:
            # Fallback: return most recent memories
            top_memories = sorted(memories, key=lambda m: m.created_at, reverse=True)[:top_k]

        return [
            {
                "text": m.memory_text,
                "type": m.memory_type,
                "confidence": m.confidence,
                "related_movies": json.loads(m.related_movies) if m.related_movies else [],
            }
            for m in top_memories
        ]

    def _get_profile(self, user_id: int, db: Session) -> Optional[dict]:
        """Fetch the user's structured taste profile."""
        profile = db.exec(
            select(UserProfileRecord).where(UserProfileRecord.user_id == user_id)
        ).first()

        if not profile:
            return None

        try:
            return json.loads(profile.profile_json)
        except (json.JSONDecodeError, ValueError):
            return None


# ---------------------------------------------------------------------------
# Cached wrapper
# ---------------------------------------------------------------------------

def get_rag_context_cached(
    user_id: int,
    query: str,
    strategy: str,
    count: int,
    db: Session,
    retriever: RAGRetriever = None,
) -> RetrievalResult:
    """RAG retrieval with in-memory caching (5-min TTL)."""
    cache_key = f"{user_id}:{hash(query)}:{strategy}"
    now = time.time()

    cached = _rag_cache.get(cache_key)
    if cached and (now - cached[0]) < _RAG_CACHE_TTL:
        logger.info("RAG cache HIT for user %d", user_id)
        return cached[1]

    if retriever is None:
        retriever = RAGRetriever()
    result = retriever.retrieve_context(user_id, query, strategy, count, db)

    # Evict expired entries when cache grows too large (simple bounded cache)
    if len(_rag_cache) >= _RAG_CACHE_MAX_SIZE:
        expired = [k for k, (ts, _) in _rag_cache.items() if (now - ts) >= _RAG_CACHE_TTL]
        for k in expired:
            _rag_cache.pop(k, None)
        # Still too large? Drop the oldest half
        if len(_rag_cache) >= _RAG_CACHE_MAX_SIZE:
            for k in sorted(_rag_cache, key=lambda k: _rag_cache[k][0])[: len(_rag_cache) // 2]:
                _rag_cache.pop(k, None)

    _rag_cache[cache_key] = (now, result)
    return result
