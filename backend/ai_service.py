"""AI service for movie recommendations supporting DeepSeek and OpenAI models."""

import json
import re
from collections import Counter, defaultdict
from typing import Optional

from openai import OpenAI, APIError, APITimeoutError, RateLimitError, AuthenticationError

from models import MediaRating, MediaRecommendation
from scraper.match import normalize, normalize_unicode, remove_special_chars, title_words
from config_manager import get_api_key as get_config_api_key
from movie_search import search_movies as search_external_movies


# Model configuration
MODEL_CONFIGS = {
    "deepseek": {
        "api_base": "https://api.deepseek.com",
        "model": "deepseek-chat",
        "env_key": "DEEPSEEK_API_KEY",
    },
    "openai": {
        "api_base": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "env_key": "OPENAI_API_KEY",
    },
}

# Per-strategy temperature configuration
# Lower = more deterministic/focused, Higher = more creative/diverse
STRATEGY_TEMPERATURES = {
    "taste": 0.5,      # Precise matching to user's taste
    "classics": 0.6,   # Balanced for canonical picks
    "mood": 0.7,       # Moderate creativity for mood matching
    "era": 0.6,        # Focused on time period
    "gems": 0.8,       # More creative for hidden finds
    "explore": 0.9,    # Most creative for new genres
}

DEFAULT_TEMPERATURE = 0.7
MAX_TOKENS = 3000  # Increased from 2000 for Chinese responses


class AIService:
    """Service for generating movie recommendations using AI models."""

    def __init__(self, api_key: str, model_type: str = "deepseek"):
        """
        Initialize the AI service.

        Args:
            api_key: API key for the AI service
            model_type: 'deepseek' or 'openai'

        Raises:
            ValueError: If model_type is unsupported
        """
        if model_type not in MODEL_CONFIGS:
            supported = ", ".join(MODEL_CONFIGS.keys())
            raise ValueError(f"Unsupported model '{model_type}'. Supported: {supported}")

        config = MODEL_CONFIGS[model_type]
        self.model_type = model_type
        self.model_name = config["model"]
        self.client = OpenAI(
            api_key=api_key,
            base_url=config["api_base"],
        )

    def _analyze_user_taste(self, movies: list[MediaRating]) -> dict:
        """Analyze user's watched movies and extract taste patterns.

        Returns a structured dict with:
          - top_genres: genres sorted by avg rating (desc)
          - decade_distribution: count per decade
          - avg_rating: overall average
          - rating_distribution: percent per tier
          - total: movie count
        """
        if not movies:
            return {"top_genres": [], "decade_distribution": {}, "avg_rating": 0, "rating_distribution": {}, "total": 0}

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

        return {
            "top_genres": top_genres,
            "decade_distribution": top_decades,
            "avg_rating": round(avg_rating, 1),
            "rating_distribution": rating_dist,
            "total": total,
        }

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
                f"{d}年代{'-' + str(d+9) + '年代' if d < 2020 else ''}({c}部)"
                for d, c in sorted(taste["decade_distribution"].items())
            )
            parts.append(f"  活跃年代：{decade_desc}")

        dist = taste["rating_distribution"]
        parts.append(
            f"  评分分布：高分({dist['high_rating_8_10']}%) 中等({dist['mid_rating_5_8']}%) 低分({dist['low_rating_0_5']}%)"
        )
        parts.append(f"  平均评分：{taste['avg_rating']}/10（共{taste['total']}部）")

        return "\n".join(parts)

    def _build_prompt(
        self,
        movies: list[MediaRating],
        count: int,
        strategy: str = "taste",
        strategy_params: Optional[dict] = None,
        watched_titles: Optional[list[str]] = None,
        taste_analysis: Optional[dict] = None,
        exclude_titles: Optional[list[str]] = None,
        retry_attempt: int = 0,
    ) -> str:
        """Build an optimized prompt for the AI model with taste analysis and exclude list.

        Instead of listing ALL watched movies (which wastes tokens), this uses:
        - A compact sample of top movies (up to 15 highest-rated) as concrete examples
        - A structured taste analysis summary (the real signal — tells the AI the patterns)
        - An ``exclude_titles`` list that explicitly tells the AI which titles to avoid
        - A ``retry_attempt`` hint when the previous attempt's suggestions were
          already watched by the user
        """

        # Compact sample: top 15 highest-rated movies as concrete examples
        movies_sorted = sorted(movies, key=lambda m: m.rating or 0, reverse=True)
        sample = movies_sorted[:15]
        movies_list = "\n".join(
            f"- {m.title}" + (f" ({m.year})" if m.year else "") +
            (f" [{m.genre}]" if m.genre else "") +
            f" — Rating: {m.rating}/10"
            for m in sample
        )
        total_count = len(movies)

        # Taste analysis summary
        taste_summary = ""
        if taste_analysis:
            taste_summary = self._build_taste_summary(taste_analysis)

        strategy_instruction = self._get_strategy_instruction(strategy, strategy_params, count)

        # Retry hint — tells the AI its previous suggestions were already seen
        retry_hint = ""
        if retry_attempt > 0:
            retry_hint = (
                f"\n\nNote: This is retry #{retry_attempt}. Your previous suggestions were "
                "all movies the user has already seen. Please recommend DIFFERENT movies "
                "this time, being extra careful to avoid the exclusion list below."
            )

        # Explicit exclusion list (used on retry to prevent recommending already-seen titles)
        exclude_section = ""
        if exclude_titles:
            exclude_titles_clean = [t for t in exclude_titles if t]
            if exclude_titles_clean:
                # Limit to 100 to avoid blowing the token budget
                exclude_list = "\n".join(f"- {t}" for t in exclude_titles_clean[:100])
                if len(exclude_titles_clean) > 100:
                    exclude_list += f"\n- ... and {len(exclude_titles_clean) - 100} more"
                exclude_section = f"""

## Strict Exclusion List — DO NOT recommend ANY of these titles
You MUST NOT recommend any of the following movies, even if they seem like a good fit:
{exclude_list}
"""

        return f"""You are a professional movie recommendation expert. Based on the movies the user has watched and their ratings, recommend NEW movies they haven't seen.

## User's Taste Profile
Total watched movies: {total_count}. Below is a sample of {len(sample)} highest-rated movies:
{movies_list}

## Taste Analysis
{taste_summary or "No taste analysis available."}
{exclude_section}{retry_hint}

{strategy_instruction}

## Additional Requirements
1. Each recommendation MUST include a personalized reason that references the user's specific taste (genres they rate highly, preferred eras, etc.)
2. Confidence score (0-1) should reflect how well the movie matches the user's demonstrated taste
3. DIVERSITY: Do NOT recommend multiple movies from the same franchise, same director (unless the user clearly loves that director), or same series
4. Use Chinese/localized titles for ALL movies where a Chinese title exists (e.g. "The Shawshank Redemption" → "肖申克的救赎", "Inception" → "盗梦空间")
5. Only use English titles for movies without a known Chinese translation
6. The reason MUST be in Chinese
7. Ensure recommendations are genuinely diverse in genre, era, and style

Respond with ONLY valid JSON in the following format, without any markdown formatting or code blocks:
{{
    "recommendations": [
        {{
            "title": "Movie Title (use Chinese title if available)",
            "year": 2024,
            "genre": "Sci-Fi / Action",
            "reason": "Recommendation reason in Chinese, referencing user's taste",
            "confidence": 0.85
        }}
    ]
}}
"""

    def _get_strategy_instruction(self, strategy: str, params: Optional[dict] = None, count: int = 5) -> str:
        """Get strategy-specific instructions for the AI prompt."""
        params = params or {}

        strategy_prompts = {
            "taste": (
                f"Based on the user's taste patterns above, recommend {count} movies they would likely enjoy. "
                f"Focus on matching genres they rate highly, directors/styles they prefer, and eras they watch most. "
                f"Prioritize films that closely align with their demonstrated preferences."
            ),
            "classics": (
                f"Recommend {count} classic must-watch movies that every film enthusiast should see. "
                f"Focus on critically acclaimed, culturally significant, and timeless films. "
                f"Balance the user's existing taste with canonical cinematic masterpieces they may have missed. "
                f"Prioritize movies that bridge their current taste with essential film history."
            ),
            "mood": (
                f"Based on the movies the user has watched, recommend {count} movies that match "
                + (f"the following mood or feeling: \"{params.get('mood', '')}\". " if params.get('mood') else "a specific mood. ")
                + f"Consider the emotional tone, atmosphere, and pacing. "
                + f"Use the user's taste analysis to find movies that match both their preferences and the requested mood."
            ),
            "era": (
                f"Recommend {count} movies specifically from a particular time period. "
                + (f"Focus on movies from {params.get('year_start', '')} to {params.get('year_end', '')}. " if params.get('year_start') or params.get('year_end') else "Focus on a specific era. ")
                + f"Consider how the user's demonstrated taste translates to films from this period."
            ),
            "gems": (
                f"Recommend {count} underrated hidden gems and lesser-known movies. "
                f"Avoid mainstream blockbusters and well-known titles. "
                f"Focus on overlooked indie films, cult classics, foreign cinema, and hidden treasures "
                f"that align with the user's demonstrated taste preferences. "
                f"These should feel like discoveries, not obvious picks."
            ),
            "explore": (
                f"Recommend {count} movies that explore NEW genres and styles OUTSIDE the user's usual preferences. "
                f"Analyze which genres the user watches least or hasn't tried yet, "
                + (f"recommend excellent movies in \"{params.get('target_genre', 'new genres')}\" that serve as great entry points. " if params.get('target_genre') else "recommend excellent movies in those genres that serve as great entry points. ")
                + f"Choose films widely considered masterpieces in their respective genres. "
                + f"The goal is to expand the user's horizons while still providing an enjoyable experience."
            ),
        }

        return strategy_prompts.get(strategy, strategy_prompts["taste"])

    def _extract_json(self, content: str) -> str:
        """Extract JSON from AI response, handling markdown code blocks and extraneous text."""
        # Try to extract content from markdown code blocks first
        block_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
        if block_match:
            content = block_match.group(1).strip()

        # Find the outermost JSON object
        brace_depth = 0
        start = -1
        for i, ch in enumerate(content):
            if ch == "{":
                if brace_depth == 0:
                    start = i
                brace_depth += 1
            elif ch == "}":
                brace_depth -= 1
                if brace_depth == 0 and start >= 0:
                    return content[start: i + 1]

        raise ValueError("No valid JSON object found in AI response")

    def _parse_response(self, content: str) -> list[MediaRecommendation]:
        """Parse the AI response into structured recommendations."""
        json_str = self._extract_json(content)

        try:
            data = json.loads(json_str)
        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse AI response as JSON: {e}")

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
            )
            for r in recs
        ]

    @staticmethod
    def _resolve_posters(recs: list) -> list:
        """Search TMDB for each recommendation's poster URL (sequential).

        Works with both ``list[MediaRecommendation]`` and ``list[dict]``.
        If TMDB is not configured, returns recs unchanged.
        """
        tmdb_key = get_config_api_key("tmdb")
        if not tmdb_key or not recs:
            return recs

        is_dict = isinstance(recs[0], dict)

        for rec in recs:
            title = rec.get("title", "") if is_dict else getattr(rec, "title", "")
            year = rec.get("year") if is_dict else getattr(rec, "year", None)
            if not title:
                continue
            try:
                results = search_external_movies(title, "tmdb")
                if results:
                    # Prefer year match, otherwise first result with poster
                    year_match = next(
                        (r for r in results if r.get("year") == year and r.get("poster_url")),
                        None,
                    )
                    fallback = next((r for r in results if r.get("poster_url")), None)
                    match = year_match or fallback or results[0]
                    poster_url = match.get("poster_url")
                    if poster_url:
                        if is_dict:
                            rec["poster_url"] = poster_url
                        else:
                            rec.poster_url = poster_url
            except Exception:
                continue

        return recs

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
            """Jaccard-based similarity sans substring match."""
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
            if not words_a or not words_b:
                return 0.0
            intersection = words_a & words_b
            union = words_a | words_b
            return len(intersection) / len(union)

        filtered = []
        for r in recs:
            title = r.get("title", "") if isinstance(r, dict) else getattr(r, "title", "")
            if not title:
                filtered.append(r)
                continue
            if not any(_match_score(title, wt) >= MATCH_THRESHOLD for wt in watched_clean):
                filtered.append(r)

        # Also deduplicate within the same batch — AI sometimes returns the same
        # movie twice in one response (exact title or fuzzy match).
        seen_titles: list[str] = []
        deduped = []
        for r in filtered:
            title = r.get("title", "") if isinstance(r, dict) else getattr(r, "title", "")
            if not title:
                deduped.append(r)
                continue
            if not any(_match_score(title, st) >= MATCH_THRESHOLD for st in seen_titles):
                seen_titles.append(title)
                deduped.append(r)

        return deduped

    def get_recommendations(
        self,
        movies: list[MediaRating],
        count: int = 5,
        strategy: str = "taste",
        strategy_params: Optional[dict] = None,
        watched_titles: Optional[list[str]] = None,
        taste_analysis: Optional[dict] = None,
    ) -> list[MediaRecommendation]:
        """Generate movie recommendations (non-streaming) with retry.

        If the fuzzy dedup filter removes some recommendations, this retries
        up to ``MAX_RETRIES`` times — each time asking the AI to recommend
        different movies — until the requested ``count`` is met.
        """
        MAX_RETRIES = 3
        temperature = STRATEGY_TEMPERATURES.get(strategy, DEFAULT_TEMPERATURE)
        all_excluded = list(watched_titles or [])
        all_recs: list[MediaRecommendation] = []

        for attempt in range(MAX_RETRIES):
            remaining = count - len(all_recs)
            if remaining <= 0:
                break

            prompt = self._build_prompt(
                movies, remaining, strategy, strategy_params,
                watched_titles=all_excluded, taste_analysis=taste_analysis,
                exclude_titles=all_excluded,
                retry_attempt=attempt,
            )

            try:
                response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=[
                        {
                            "role": "system",
                            "content": "You are a professional movie recommendation expert who analyzes user taste and recommends suitable movies. Always respond with valid JSON only.",
                        },
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
            except APIError as e:
                raise ValueError(f"{self.model_type} API error ({e.status_code}): {e.message}")

            content = response.choices[0].message.content
            if not content:
                if attempt == 0:
                    raise ValueError("Empty response from AI model")
                break

            try:
                new_recs = self._parse_response(content)
            except ValueError:
                if attempt == 0:
                    raise
                break

            new_recs = self._filter_watched(new_recs, all_excluded)
            if not new_recs:
                # Don't break — retry with retry_hint might help the AI avoid
                # watched movies on the next attempt
                continue

            all_recs.extend(new_recs)
            all_excluded.extend(r.title for r in new_recs)

        all_recs = self._resolve_posters(all_recs)
        return all_recs[:count]

    def _build_followup_prompt(
        self,
        movies: list[MediaRating],
        previous_recommendations: list,
        conversation: list,
        question: str,
        count: int,
        watched_titles: Optional[list[str]] = None,
        taste_analysis: Optional[dict] = None,
        exclude_titles: Optional[list[str]] = None,
    ) -> str:
        """Build the prompt for follow-up conversation.

        When ``exclude_titles`` is provided (e.g. on retry), appends a
        strict exclusion section to prevent the AI from suggesting
        already-recommended or already-watched movies.
        """
        # Compact sample: top 15 highest-rated movies
        movies_sorted = sorted(movies, key=lambda m: m.rating or 0, reverse=True)
        sample = movies_sorted[:15]
        movies_list = "\n".join(
            f"- {m.title}" + (f" ({m.year})" if m.year else "") +
            (f" [{m.genre}]" if m.genre else "") +
            f" — Rating: {m.rating}/10"
            for m in sample
        )
        total_count = len(movies)

        recs_list = "\n".join(
            f"- {r.title}" + (f" ({r.year})" if r.year else "") +
            (f" [{r.genre}]" if r.genre else "") +
            f" — Confidence: {r.confidence * 100:.0f}%" +
            f" — Reason: {r.reason}"
            for r in previous_recommendations
        )

        conv_history = "\n".join(f"{m.role}: {m.content}" for m in conversation)

        # Taste analysis
        taste_summary = ""
        if taste_analysis:
            taste_summary = self._build_taste_summary(taste_analysis)

        # Explicit exclusion list for retry
        exclude_section = ""
        if exclude_titles:
            exclude_clean = [t for t in exclude_titles if t]
            if exclude_clean:
                exclude_list = "\n".join(f"- {t}" for t in exclude_clean[:100])
                if len(exclude_clean) > 100:
                    exclude_list += f"\n- ... and {len(exclude_clean) - 100} more"
                exclude_section = f"""

## Strict Exclusion List — DO NOT recommend ANY of these titles
You MUST NOT recommend any of the following movies, even if they seem like a good fit:
{exclude_list}
"""

        return f"""You are a professional movie recommendation expert in a conversation with a user.

## User's Taste Profile
Total watched movies: {total_count}. Below is a sample of {len(sample)} highest-rated movies:
{movies_list}

## Taste Analysis
{taste_summary or "No taste analysis available."}

## Previously Recommended
{recs_list}
{exclude_section}

## Conversation
{conv_history}

## User's New Question
{question}

Note: All ratings are on a 0-10 scale. 8/10 is very good, 5/10 is average, 2/10 is poor.
Use Chinese/localized titles where available. Respond in Chinese for explanations.

IMPORTANT: You must respond with valid JSON only, without markdown code blocks, in one of these two formats:

Format 1 - When the user asks for MORE RECOMMENDATIONS (recommend {count} new movies, different from previously recommended ones):
{{{{
    "type": "recommendations",
    "message": "Your Chinese message introducing the recommendations",
    "recommendations": [
        {{{{
            "title": "Movie Title",
            "year": 2024,
            "genre": "Sci-Fi / Action",
            "reason": "Why this movie in Chinese",
            "confidence": 0.85
        }}}}
    ]
}}}}

Format 2 - For explanation or other questions:
{{{{
    "type": "text",
    "message": "Your detailed Chinese response to the user's question"
}}}}
"""

    def get_followup_stream(
        self,
        movies: list[MediaRating],
        previous_recommendations: list,
        conversation: list,
        question: str,
        count: int = 3,
        watched_titles: Optional[list[str]] = None,
        taste_analysis: Optional[dict] = None,
    ):
        """Generator that yields SSE-formatted events for follow-up conversation.

        If the response includes recommendations and the fuzzy dedup filter
        removes some, retries up to ``MAX_RETRIES`` times to fill the gap.
        """
        MAX_RETRIES = 3
        temperature = STRATEGY_TEMPERATURES.get("taste", DEFAULT_TEMPERATURE)
        all_excluded = list(watched_titles or [])
        all_recs: list[dict] = []
        response_message: str | None = None

        # Yield start event
        start_data = json.dumps({"model": self.model_type})
        yield f"event: start\ndata: {start_data}\n\n"

        for attempt in range(MAX_RETRIES):
            remaining = count - len(all_recs)
            if remaining <= 0:
                break

            prompt = self._build_followup_prompt(
                movies, previous_recommendations, conversation, question, remaining,
                watched_titles=all_excluded,
                taste_analysis=taste_analysis,
                exclude_titles=all_excluded,
            )

            try:
                stream = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=[
                        {
                            "role": "system",
                            "content": "You are a professional movie recommendation expert helping a user understand their recommendations. Always respond with valid JSON only.",
                        },
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
            except APIError as e:
                yield f"event: error\ndata: {json.dumps({'message': f'{self.model_type} API error ({e.status_code}): {e.message}'})}\n\n"
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

            new_recs = self._filter_watched(new_recs, all_excluded)
            if not new_recs:
                break

            response_message = data.get("message", "")
            all_recs.extend(new_recs)
            all_excluded.extend(r.get("title", "") for r in new_recs)

        # Resolve poster URLs from TMDB
        all_recs = self._resolve_posters(all_recs)

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
    ):
        """Generator that yields SSE-formatted events as recommendations are streamed.

        If the fuzzy dedup filter removes some recommendations, this retries
        up to ``MAX_RETRIES`` times — each time asking the AI to recommend
        different movies — until the requested ``count`` is met.  Chunk events
        from each retry attempt are forwarded to the frontend for progress
        indication, but all recommendations are yielded after all retries
        complete, followed by a single ``done`` event.
        """
        MAX_RETRIES = 3
        temperature = STRATEGY_TEMPERATURES.get(strategy, DEFAULT_TEMPERATURE)
        all_excluded = list(watched_titles or [])
        all_recs: list[dict] = []

        # Yield start event
        start_data = json.dumps({"model": self.model_type, "source_count": len(movies)})
        yield f"event: start\ndata: {start_data}\n\n"

        for attempt in range(MAX_RETRIES):
            remaining = count - len(all_recs)
            if remaining <= 0:
                break

            prompt = self._build_prompt(
                movies, remaining, strategy, strategy_params,
                watched_titles=all_excluded, taste_analysis=taste_analysis,
                exclude_titles=all_excluded,
                retry_attempt=attempt,
            )

            # SSE stream from AI
            try:
                stream = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=[
                        {
                            "role": "system",
                            "content": "You are a professional movie recommendation expert who analyzes user taste and recommends suitable movies. Always respond with valid JSON only.",
                        },
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
            except APIError as e:
                yield f"event: error\ndata: {json.dumps({'message': f'{self.model_type} API error ({e.status_code}): {e.message}'})}\n\n"
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

            new_recs = self._filter_watched(new_recs, all_excluded)
            if not new_recs:
                # Don't break — retry with retry_hint might help
                continue

            all_recs.extend(new_recs)
            all_excluded.extend(r.get("title", "") if isinstance(r, dict) else getattr(r, "title", "") for r in new_recs)

        # Resolve poster URLs from TMDB before yielding
        all_recs = self._resolve_posters(all_recs)

        # Yield all recommendations after all retries complete
        for rec in all_recs[:count]:
            title = rec.get("title", "Unknown") if isinstance(rec, dict) else getattr(rec, "title", "Unknown")
            year = rec.get("year") if isinstance(rec, dict) else getattr(rec, "year", None)
            genre = rec.get("genre") if isinstance(rec, dict) else getattr(rec, "genre", None)
            reason = rec.get("reason", "") if isinstance(rec, dict) else getattr(rec, "reason", "")
            confidence_raw = rec.get("confidence", 0.5) if isinstance(rec, dict) else getattr(rec, "confidence", 0.5)
            poster_url = rec.get("poster_url") if isinstance(rec, dict) else getattr(rec, "poster_url", None)

            rec_data = json.dumps({
                "title": title,
                "year": year,
                "genre": genre,
                "reason": reason,
                "confidence": min(max(float(confidence_raw), 0.0), 1.0),
                "poster_url": poster_url,
            })
            yield f"event: recommendation\ndata: {rec_data}\n\n"

        # Yield done event
        done_data = json.dumps({
            "model_used": self.model_type,
            "source_count": len(movies),
            "total": len(all_recs[:count]),
        })
        yield f"event: done\ndata: {done_data}\n\n"
