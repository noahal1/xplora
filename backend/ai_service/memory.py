"""Memory generation — extracts natural language taste memories from ratings.

Uses an LLM to analyse a user's rating history and produce structured
memory entries (preference, anti-preference, evolution, etc.) that are
stored in the ``user_memories`` table and used for RAG retrieval.

When movie embeddings are available, representative movies are selected
via cosine-similarity clustering so the LLM receives a diverse, compact
sample instead of a flat top-30 list.
"""

import json
import logging
from typing import Optional

import numpy as np
from sqlmodel import Session, select

from models import UserMemoryRecord, MediaItemRecord, MovieEmbeddingRecord
from .constants import SYSTEM_PROMPT_RECOMMEND, MAX_TOKENS, STRATEGY_TEMPERATURES

logger = logging.getLogger(__name__)

# Maximum number of representative movies to send to the LLM per cluster
_MAX_PER_CLUSTER = 5
# Target number of clusters (auto-adjusted when fewer movies available)
_TARGET_CLUSTERS = 8

# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

MEMORY_GENERATION_PROMPT = """你是一个电影品味分析师。根据用户的评分历史，提取关键的品味记忆。

## 用户评分数据
{ratings_data}

## 已有记忆（避免重复）
{existing_memories}

## 任务
分析评分数据，提取 3-5 条关键品味记忆。每条记忆应该是自然语言描述，捕捉用户品味的一个维度。
重点关注：
1. 用户反复高分的类型/导演/风格组合（preference）
2. 用户明确低分的类型或模式（anti_preference）
3. 最近评分趋势的变化（evolution）
4. 特殊场景下的偏好（context）

## 输出格式（JSON）
{{
    "memories": [
        {{
            "text": "用户给寄生虫、老男孩、杀人回忆都打了9分以上——偏好具有社会讽刺主题的韩国惊悚片",
            "type": "preference",
            "confidence": 0.95,
            "related_movies": ["寄生虫", "老男孩", "杀人回忆"]
        }},
        {{
            "text": "用户给宿醉、泰囧等闹剧喜剧评分较低（4-5分）——不喜欢无脑搞笑类电影",
            "type": "anti_preference",
            "confidence": 0.85,
            "related_movies": ["宿醉", "泰囧"]
        }},
        {{
            "text": "用户最近开始给纪录片打高分——可能正在拓展观影类型",
            "type": "evolution",
            "confidence": 0.70,
            "related_movies": ["徒手攀岩", "冰冻星球"]
        }}
    ]
}}

## 记忆类型说明
- preference: 正向偏好（喜欢什么类型/导演/风格/年代组合）
- anti_preference: 负向偏好（不喜欢什么）
- evolution: 品味演变（最近几个月的变化趋势）
- context: 观影上下文（比如"适合深夜观看的放松电影"）
- milestone: 里程碑（突破性的新偏好，如第一次给纪录片打高分）

注意：
- confidence 应基于数据量和一致性来评估
- 每条记忆应该有具体的电影作为证据
- 不要重复已有的记忆
- 优先提取跨多部电影的模式，而不是单部电影的偏好
"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_memories(
    user_id: int,
    movies: list,
    existing_memories: list[UserMemoryRecord],
    model_type: str,
    api_key: str,
    db: Session,
) -> list[UserMemoryRecord]:
    """Generate taste memories from a user's rating history.

    Parameters
    ----------
    user_id : int
        The user's ID.
    movies : list
        List of ``MediaItemRecord`` or dicts with title/rating/year/genre.
    existing_memories : list[UserMemoryRecord]
        Current active memories (to avoid duplication).
    model_type : str
        LLM provider key (e.g. "deepseek").
    api_key : str
        API key for the LLM.
    db : Session
        Database session.

    Returns
    -------
    list[UserMemoryRecord]
        Newly created memory records.
    """
    if len(movies) < 3:
        logger.info("Not enough movies (%d) for memory generation, skipping", len(movies))
        return []

    # Build ratings summary for the prompt
    ratings_data = _format_ratings(movies, user_id=user_id, db=db)
    existing_text = _format_existing_memories(existing_memories)

    prompt = MEMORY_GENERATION_PROMPT.format(
        ratings_data=ratings_data,
        existing_memories=existing_text or "（暂无已有记忆）",
    )

    # Call LLM
    from ai_service.constants import MODEL_CONFIGS
    from openai import OpenAI

    config = MODEL_CONFIGS.get(model_type, MODEL_CONFIGS.get("deepseek"))
    client = OpenAI(api_key=api_key, base_url=config["api_base"])

    try:
        response = client.chat.completions.create(
            model=config["model"],
            messages=[
                {"role": "system", "content": "你是一个电影品味分析师。请始终用有效的 JSON 回复，不要使用 markdown 代码块。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,  # Low temperature for consistent analysis
            max_tokens=MAX_TOKENS,
        )
    except Exception as e:
        logger.error("LLM call failed for memory generation: %s", e)
        return []

    content = response.choices[0].message.content
    if not content:
        logger.warning("Empty LLM response for memory generation")
        return []

    # Parse response
    try:
        # Extract JSON from response
        json_str = content
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0]
        elif "```" in json_str:
            json_str = json_str.split("```")[1].split("```")[0]
        data = json.loads(json_str.strip())
        memories_data = data.get("memories", [])
    except (json.JSONDecodeError, IndexError):
        logger.warning("Failed to parse memory generation response: %s", content[:200])
        return []

    if not memories_data:
        return []

    # Store memories
    created = []
    for mem_data in memories_data:
        record = UserMemoryRecord(
            user_id=user_id,
            memory_text=mem_data.get("text", ""),
            memory_type=mem_data.get("type", "preference"),
            confidence=min(max(float(mem_data.get("confidence", 0.7)), 0.0), 1.0),
            related_movies=json.dumps(mem_data.get("related_movies", []), ensure_ascii=False),
            source_ratings=json.dumps(
                [{"title": getattr(m, 'title', '') or '', "rating": getattr(m, 'rating', 0) or 0}
                 for m in movies[:20]],
                ensure_ascii=False,
            ),
        )
        db.add(record)
        created.append(record)

    # Mark old memories of same type as superseded
    if created:
        for old in existing_memories:
            if old.memory_type in [m.get("type") for m in memories_data]:
                old.is_active = False
                old.superseded_by = created[0].id

    db.commit()
    logger.info("Generated %d memories for user %d", len(created), user_id)
    return created


def should_regenerate_memories(
    existing_memories: list[UserMemoryRecord],
    new_movie_count: int,
    min_interval_seconds: int = 3600,
) -> bool:
    """Check whether memories should be regenerated.

    Triggers on:
    - Fewer than 3 active memories (but never more than once per
      ``min_interval_seconds`` — avoids an LLM call on every new rating)
    - ≥ 5 new ratings since last generation AND enough time has passed
    - No memories generated yet
    """
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)

    active = [m for m in existing_memories if m.is_active]

    # Time guard: don't regenerate more often than min_interval_seconds
    # after the most recent generation.
    if active:
        last_gen = max(m.updated_at for m in active)
        if (now - last_gen).total_seconds() < min_interval_seconds:
            return False

    if not active:
        return True
    if len(active) < 3:
        return True
    if new_movie_count >= 5:
        return True
    return False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _select_representative_movies(
    user_id: int,
    movies: list,
    db: Session,
    target_count: int = 30,
) -> list:
    """Select representative movies using embedding-based clustering.

    Fetches the dense vectors stored in ``movie_embeddings``, clusters
    them with KMeans, and picks the most rating-extreme movies from
    each cluster so the LLM sees a diverse, representative sample.

    Falls back to the simple "top by extreme rating" heuristic when
    embeddings are unavailable.
    """
    # 1. Fetch embedding records for this user
    emb_records = db.exec(
        select(MovieEmbeddingRecord).where(
            MovieEmbeddingRecord.user_id == user_id
        )
    ).all()

    if len(emb_records) < 10:
        # Too few embeddings — fall back to simple heuristic
        return _select_by_extreme_rating(movies, target_count)

    # 2. Build lookup: title.lower() → embedding record
    emb_by_title = {r.title.lower(): r for r in emb_records}

    # 3. Pair each movie with its embedding (if available)
    paired = []
    for m in movies:
        key = (getattr(m, 'title', '') or '').lower()
        rec = emb_by_title.get(key)
        if rec and rec.embedding_dense:
            try:
                vec = np.array(json.loads(rec.embedding_dense), dtype=np.float32)
                if vec.shape[0] > 0 and np.linalg.norm(vec) > 0:
                    paired.append((m, vec, rec))
            except (json.JSONDecodeError, ValueError):
                continue

    if len(paired) < 10:
        return _select_by_extreme_rating(movies, target_count)

    # 4. KMeans clustering
    n_clusters = min(_TARGET_CLUSTERS, len(paired) // 3)
    n_clusters = max(n_clusters, 2)

    try:
        from sklearn.cluster import KMeans

        matrix = np.array([p[1] for p in paired])
        km = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
        labels = km.fit_predict(matrix)
    except ImportError:
        logger.debug("sklearn not available, using fallback clustering")
        labels = _cosine_cluster([p[1] for p in paired], n_clusters)

    # 5. Group by cluster
    clusters: dict[int, list] = {}
    for idx, label in enumerate(labels):
        clusters.setdefault(int(label), []).append(paired[idx])

    # 6. From each cluster, pick the most extreme movies
    per_cluster = max(2, target_count // n_clusters)
    selected = []
    for _cid, members in clusters.items():
        # Sort by distance from 5 (most extreme first)
        members.sort(
            key=lambda p: abs((getattr(p[0], 'rating', 5) or 5) - 5),
            reverse=True,
        )
        # Take top per_cluster, ensure we get both high and low
        high = [m for m in members if (getattr(m[0], 'rating', 5) or 5) >= 7]
        low = [m for m in members if (getattr(m[0], 'rating', 5) or 5) <= 4]
        mid = [m for m in members if 4 < (getattr(m[0], 'rating', 5) or 5) < 7]

        picks = []
        # Up to 2 high-rated per cluster
        picks.extend(high[:2])
        # Up to 2 low-rated per cluster
        picks.extend(low[:2])
        # Fill remaining from mid
        remaining = per_cluster - len(picks)
        if remaining > 0:
            picks.extend(mid[:remaining])
        # If still short, take more from any
        remaining = per_cluster - len(picks)
        if remaining > 0:
            for m in members:
                if m not in picks and len(picks) < per_cluster:
                    picks.append(m)
        selected.extend(picks)

    # 7. If we have too many, do a final diversity pass
    if len(selected) > target_count:
        selected = _diversify(selected, target_count)

    logger.info(
        "Embedding clustering: %d movies → %d clusters → %d representatives",
        len(paired), n_clusters, len(selected),
    )
    return [p[0] for p in selected]


def _select_by_extreme_rating(movies: list, target_count: int) -> list:
    """Fallback: pick movies with the most extreme ratings."""
    sorted_movies = sorted(
        movies, key=lambda m: abs((getattr(m, 'rating', 5) or 5) - 5), reverse=True
    )
    return sorted_movies[:target_count]


def _cosine_cluster(vectors: list, n_clusters: int) -> list[int]:
    """Simple cosine-distance-based clustering without sklearn.

    Assigns each vector to the nearest centroid found by iterative
    k-means++-style seeding on the cosine similarity matrix.
    """
    mat = np.array(vectors, dtype=np.float32)
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1, norms)
    mat_norm = mat / norms

    # Seed centroids using farthest-point selection
    centroids = [0]
    for _ in range(n_clusters - 1):
        sims = mat_norm @ mat_norm[centroids[-1]]
        best = int(np.argmax(np.abs(1 - sims)))
        if best not in centroids:
            centroids.append(best)
        else:
            # Random fallback
            for i in range(len(mat)):
                if i not in centroids:
                    centroids.append(i)
                    break

    cent_mat = mat_norm[centroids]
    all_sims = mat_norm @ cent_mat.T  # (n, k)
    labels = np.argmax(all_sims, axis=1)
    return labels.tolist()


def _diversify(picks: list, target: int) -> list:
    """Reduce picks to *target* while keeping rating diversity."""
    # Ensure we keep at least some high and low rated
    high = [p for p in picks if (getattr(p[0], 'rating', 5) or 5) >= 7]
    low = [p for p in picks if (getattr(p[0], 'rating', 5) or 5) <= 4]
    mid = [p for p in picks if 4 < (getattr(p[0], 'rating', 5) or 5) < 7]

    result = []
    result.extend(high[:target // 3])
    result.extend(low[:target // 3])
    result.extend(mid[:target - len(result)])

    # Fill remainder from any
    remaining = target - len(result)
    if remaining > 0:
        for p in picks:
            if p not in result and len(result) < target:
                result.append(p)
    return result[:target]


def _format_ratings(movies: list, user_id: int = 0, db: Session = None) -> str:
    """Format movie ratings for the LLM prompt.

    When *user_id* and *db* are provided and embeddings exist, movies are
    selected via embedding-based clustering for better diversity.
    Otherwise falls back to the simple extreme-rating heuristic.
    """
    if user_id and db:
        selected = _select_representative_movies(user_id, movies, db)
    else:
        selected = _select_by_extreme_rating(movies, 30)

    lines = []
    for m in selected:
        title = getattr(m, 'title', '') or ''
        rating = getattr(m, 'rating', 0) or 0
        year = getattr(m, 'year', None)
        genre = getattr(m, 'genre', '') or ''

        line = f"- {title}"
        if year:
            line += f" ({year})"
        if genre:
            line += f" [{genre}]"
        line += f" — 评分: {rating}/10"
        lines.append(line)

    if len(movies) > len(selected):
        lines.append(f"- ... 以及其他 {len(movies) - len(selected)} 部电影")

    return "\n".join(lines)


def _format_existing_memories(memories: list[UserMemoryRecord]) -> str:
    """Format existing memories for the prompt."""
    active = [m for m in memories if m.is_active]
    if not active:
        return ""

    lines = []
    for m in active[:10]:
        lines.append(f"- [{m.memory_type}] {m.memory_text}")
    return "\n".join(lines)
