"""BGE-M3 embedding pipeline for the RAG user profile system.

Provides dense (1024-dim), sparse (lexical), and ColBERT (token-level)
embeddings for movie descriptions.  BGE-M3 is the default embedder —
completely free (MIT license), local, and supports 100+ languages.

Fallback providers (OpenAI) are available when GPU/CPU resources are
unavailable or when BGE-M3 loading fails.
"""

import json
import logging
import os
import time
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

EMBEDDING_DIMENSIONS = 1024  # BGE-M3 dense output dimension

EMBEDDING_CONFIGS = {
    "bge-m3": {
        "model": "BAAI/bge-m3",
        "dimensions": 1024,
        "max_tokens": 8192,
        "supports_sparse": True,
        "supports_colbert": True,
        "cost_per_1k_tokens": 0,
    },
    "bge-large-zh": {
        "model": "BAAI/bge-large-zh-v1.5",
        "dimensions": 1024,
        "max_tokens": 512,
        "supports_sparse": False,
        "supports_colbert": False,
        "cost_per_1k_tokens": 0,
    },
    "openai": {
        "model": "text-embedding-3-small",
        "dimensions": 1536,
        "max_tokens": 8191,
        "supports_sparse": False,
        "supports_colbert": False,
        "cost_per_1k_tokens": 0.00002,
    },
}

DEFAULT_EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "bge-m3")
FALLBACK_EMBEDDING_PROVIDER = "openai"


# ---------------------------------------------------------------------------
# Lazy model singletons (avoid repeated loading)
# ---------------------------------------------------------------------------

_bge_m3_model = None
_bge_zh_model = None


def _get_bge_m3_model():
    """Get or lazily load the BGE-M3 model (heavy, ~2.2 GB)."""
    global _bge_m3_model
    if _bge_m3_model is None:
        try:
            from FlagEmbedding import BGEM3FlagModel

            use_fp16 = _gpu_available()
            logger.info("Loading BGE-M3 model (fp16=%s) …", use_fp16)
            _bge_m3_model = BGEM3FlagModel("BAAI/bge-m3", use_fp16=use_fp16)
            logger.info("BGE-M3 model loaded successfully")
        except ImportError:
            raise ImportError(
                "FlagEmbedding is required for BGE-M3. Install with:\n"
                "  pip install FlagEmbedding"
            )
    return _bge_m3_model


def _get_bge_zh_model():
    """Get or lazily load the BGE-large-zh model (~1.3 GB)."""
    global _bge_zh_model
    if _bge_zh_model is None:
        try:
            from sentence_transformers import SentenceTransformer

            logger.info("Loading BGE-large-zh model …")
            _bge_zh_model = SentenceTransformer("BAAI/bge-large-zh-v1.5")
            logger.info("BGE-large-zh model loaded successfully")
        except ImportError:
            raise ImportError(
                "sentence-transformers is required. Install with:\n"
                "  pip install sentence-transformers"
            )
    return _bge_zh_model


def _gpu_available() -> bool:
    """Check if a CUDA or MPS GPU is available."""
    try:
        import torch

        return torch.cuda.is_available() or hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
    except ImportError:
        return False


# ---------------------------------------------------------------------------
# Embedding text builder
# ---------------------------------------------------------------------------


def build_movie_embedding_text(title: str, year=None, genre=None, rating: float = 0.0,
                               overview: str = None, keywords: list[str] = None,
                               vote_average=None, countries: list[str] = None) -> str:
    """Build a rich text description for embedding generation.

    Combines movie metadata into a single text block that captures both
    factual attributes (genre, year) and semantic content (overview, keywords).
    BGE-M3's 8K context window means we rarely need to truncate.

    Note: the user's personal ``rating`` is intentionally NOT embedded —
    it changes when the user re-rates a movie (stale embeddings) and
    pollutes semantic similarity between movies. Rating is a ranking
    signal handled downstream, not embedding content.
    """
    parts = [f"电影：{title}"]
    if year:
        parts.append(f"年份：{year}")
    if genre:
        parts.append(f"类型：{genre}")
    if overview:
        parts.append(f"简介：{overview[:400]}")
    if keywords:
        parts.append(f"关键词：{', '.join(keywords[:15])}")
    if vote_average:
        parts.append(f"TMDB评分：{vote_average}")
    if countries:
        parts.append(f"出品国家：{', '.join(countries)}")
    return " | ".join(parts)


def build_query_embedding_text(query: str, strategy: str = "taste") -> str:
    """Build a query text for recommendation-time retrieval."""
    strategy_hints = {
        "taste": "符合用户品味的电影",
        "classics": "经典必看佳作",
        "mood": f"符合特定心情的电影：{query}",
        "era": f"特定年代的电影：{query}",
        "gems": "被低估的口碑遗珠",
        "explore": "跳出用户舒适区的新鲜电影",
        "playlist": f"契合片单主题的电影：{query}",
    }
    return strategy_hints.get(strategy, query)


# ---------------------------------------------------------------------------
# Core embedding pipeline
# ---------------------------------------------------------------------------


class EmbeddingPipeline:
    """Movie embedding pipeline using BGE-M3 (default) with fallback.

    When the primary provider (default: BGE-M3) fails — e.g. missing
    ``FlagEmbedding`` dependency or model download errors — the pipeline
    automatically falls back to the OpenAI provider (if an API key is
    configured) instead of crashing.

    Usage::

        pipeline = EmbeddingPipeline()
        result = pipeline.embed_texts(["电影：寄生虫 | 类型：惊悚", ...])
        # result["dense"]  → list[list[float]]  (1024-dim or 1536-dim)
        # result["sparse"] → list[dict] | None   (lexical weights)
    """

    def __init__(self, provider: str = None):
        self.provider = provider or DEFAULT_EMBEDDING_PROVIDER
        self._fallback_used = False
        if self.provider not in EMBEDDING_CONFIGS:
            raise ValueError(f"Unknown embedding provider: {self.provider}. "
                             f"Available: {', '.join(EMBEDDING_CONFIGS.keys())}")
        self.config = EMBEDDING_CONFIGS[self.provider]

    @property
    def effective_provider(self) -> str:
        """Return the provider actually in use (may differ from requested)."""
        return FALLBACK_EMBEDDING_PROVIDER if self._fallback_used else self.provider

    def embed_texts(self, texts: list[str]) -> dict:
        """Generate embeddings for a list of texts.

        Returns dict with:
        - ``dense``: list[list[float]] — 1024-dim dense vectors
        - ``sparse``: list[dict] | None — lexical weights (BGE-M3 only)
        """
        if not texts:
            return {"dense": [], "sparse": []}

        t0 = time.time()

        if self.provider == "bge-m3":
            result = self._embed_bge_m3_with_fallback(texts)
        elif self.provider == "bge-large-zh":
            result = self._embed_bge_zh_with_fallback(texts)
        elif self.provider == "openai":
            result = self._embed_openai(texts)
        else:
            raise ValueError(f"Provider not implemented: {self.provider}")

        elapsed = time.time() - t0
        logger.info("Embedded %d texts with %s in %.2fs", len(texts), self.effective_provider, elapsed)
        return result

    def embed_single(self, text: str) -> dict:
        """Convenience: embed a single text, return dict with 'dense' and 'sparse' keys."""
        result = self.embed_texts([text])
        return {
            "dense": result["dense"][0] if result["dense"] else [],
            "sparse": result["sparse"][0] if result.get("sparse") else None,
        }

    # ── Provider implementations with fallback ────────────────────

    def _embed_bge_m3_with_fallback(self, texts: list[str]) -> dict:
        """BGE-M3 with automatic fallback to OpenAI on failure."""
        try:
            return self._embed_bge_m3(texts)
        except (ImportError, Exception) as e:
            logger.warning(
                "BGE-M3 embedding failed (%s), falling back to OpenAI", type(e).__name__
            )
            return self._fallback_to_openai(texts, str(e))

    def _embed_bge_zh_with_fallback(self, texts: list[str]) -> dict:
        """BGE-large-zh with automatic fallback to OpenAI on failure."""
        try:
            return self._embed_bge_zh(texts)
        except (ImportError, Exception) as e:
            logger.warning(
                "BGE-large-zh embedding failed (%s), falling back to OpenAI", type(e).__name__
            )
            return self._fallback_to_openai(texts, str(e))

    def _fallback_to_openai(self, texts: list[str], reason: str = "") -> dict:
        """Fall back to OpenAI embedding provider.

        Returns empty results (not zero vectors) when no API key is
        configured — zero vectors would poison the embedding index with
        unrecoverable garbage records.
        """
        try:
            from config_manager import get_api_key
            api_key = get_api_key("openai")
            if not api_key:
                logger.error(
                    "Embedding fallback failed: no OpenAI API key configured "
                    "(original error: %s). Returning empty results — caller "
                    "should skip persisting these.", reason,
                )
                return {"dense": [], "sparse": []}
            self._fallback_used = True
            return self._embed_openai(texts)
        except Exception as e:
            logger.error("OpenAI fallback also failed: %s", e)
            return {"dense": [], "sparse": []}

    def _embed_bge_m3(self, texts: list[str]) -> dict:
        """BGE-M3: dense + sparse + colbert from a single model."""
        model = _get_bge_m3_model()
        output = model.encode(
            texts,
            return_dense=True,
            return_sparse=True,
            return_colbert_vecs=False,  # colbert not stored in DB (too large)
        )
        # BGE-M3 returns lexical weights as {token: np.float32} dicts which
        # are NOT JSON-serializable — convert to plain floats first.
        sparse_raw = output.get("lexical_weights")
        sparse = None
        if sparse_raw:
            sparse = [
                {str(k): float(v) for k, v in weights.items()}
                if isinstance(weights, dict) else None
                for weights in sparse_raw
            ]
        return {
            "dense": output["dense_vecs"].tolist(),
            "sparse": sparse,
        }

    def _embed_bge_zh(self, texts: list[str]) -> dict:
        """BGE-large-zh: dense only, Chinese-optimized."""
        model = _get_bge_zh_model()
        embeddings = model.encode(texts, normalize_embeddings=True)
        return {
            "dense": embeddings.tolist(),
            "sparse": None,
        }

    def _embed_openai(self, texts: list[str]) -> dict:
        """OpenAI text-embedding-3-small: API-based fallback."""
        from openai import OpenAI
        from config_manager import get_api_key

        api_key = get_api_key("openai")
        if not api_key:
            raise ValueError("OpenAI API key not configured")

        client = OpenAI(api_key=api_key)
        response = client.embeddings.create(
            model=self.config["model"],
            input=texts,
        )
        return {
            "dense": [item.embedding for item in response.data],
            "sparse": None,
        }


# ---------------------------------------------------------------------------
# Similarity helpers
# ---------------------------------------------------------------------------


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors.

    Returns 0.0 when the vectors have different dimensions (e.g. after a
    provider switch from BGE-M3 1024-dim to OpenAI 1536-dim) instead of
    raising — a mismatched vector is treated as "no signal", not an error.
    """
    if not a or not b or len(a) != len(b):
        return 0.0
    a_arr = np.array(a, dtype=np.float32)
    b_arr = np.array(b, dtype=np.float32)
    norm_a = np.linalg.norm(a_arr)
    norm_b = np.linalg.norm(b_arr)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a_arr, b_arr) / (norm_a * norm_b))


def sparse_dot_product(query_sparse: dict, doc_sparse: dict) -> float:
    """Compute dot product between two sparse vectors (lexical weights)."""
    if not query_sparse or not doc_sparse:
        return 0.0
    # Sparse vectors are {token_id: weight} dicts
    common_keys = set(query_sparse.keys()) & set(doc_sparse.keys())
    return sum(query_sparse[k] * doc_sparse[k] for k in common_keys)
