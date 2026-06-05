"""AI service for movie recommendations supporting DeepSeek and OpenAI models."""

import json
import re
from typing import Optional

from openai import OpenAI, APIError, APITimeoutError, RateLimitError, AuthenticationError

from models import MediaRating, MediaRecommendation


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

    def _build_prompt(self, movies: list[MediaRating], count: int, strategy: str = "taste", strategy_params: Optional[dict] = None) -> str:
        """Build the prompt for the AI model with strategy support."""
        movies_list = "\n".join(
            f"- {m.title}" + (f" ({m.year})" if m.year else "") +
            (f" [{m.genre}]" if m.genre else "") +
            f" \u2014 Rating: {m.rating}/10"
            for m in movies
        )

        strategy_instruction = self._get_strategy_instruction(strategy, strategy_params, count)

        return f"""You are a professional movie recommendation expert. Based on the movies the user has watched and their ratings (on a scale of 0-10), recommend new movies.

Movies the user has watched with ratings:
{movies_list}

Note: All ratings have been normalized to a 0-10 scale. A rating of 8/10 is very good, 5/10 is average, 2/10 is poor.

{strategy_instruction}

Requirements:
1. Each recommendation must include a reason explaining why
2. The reason should analyze the user's taste based on movies they've watched
3. Give a confidence score (0-1) indicating how confident you are about this recommendation
4. Recommendations should be diverse, covering different genres and eras
5. Use Chinese/localized titles for ALL movies where a Chinese title exists (e.g. "The Shawshank Redemption" → "肖申克的救赎", "Inception" → "盗梦空间"). Only use English titles for movies without a known Chinese translation.

Respond in Chinese for the reasons, and use Chinese movie titles where available.

Please respond with ONLY valid JSON in the following format, without any markdown formatting or code blocks:
{{
    "recommendations": [
        {{
            "title": "Movie Title",
            "year": 2024,
            "genre": "Sci-Fi / Action",
            "reason": "Recommendation reason in Chinese",
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
                f"Based on the user's taste, recommend {count} movies they would likely enjoy but haven't watched yet. "
                f"Focus on matching similar genres, directors, themes, and narrative styles to their highest-rated films."
            ),
            "classics": (
                f"Recommend {count} classic must-watch movies that every film enthusiast should see. "
                f"Focus on critically acclaimed, culturally significant, and timeless films across different eras. "
                f"Balance the user's existing taste with canonical cinematic masterpieces they may have missed."
            ),
            "mood": (
                f"Based on the movies the user has watched and their ratings, recommend {count} movies that match "
                + (f"the following mood or feeling: \"{params.get('mood', '')}\". " if params.get('mood') else "a specific mood. ")
                + f"Consider the emotional tone, atmosphere, and pacing that would suit this mood."
            ),
            "era": (
                f"Recommend {count} movies specifically from a particular time period. "
                + (f"Focus on movies from {params.get('year_start', '')} to {params.get('year_end', '')}. " if params.get('year_start') or params.get('year_end') else "Focus on a specific era. ")
                + f"Consider how the user's taste translates to films from this period."
            ),
            "gems": (
                f"Recommend {count} underrated hidden gems and lesser-known movies that deserve more attention. "
                f"Avoid mainstream blockbusters and well-known titles. "
                f"Focus on overlooked indie films, cult classics, foreign cinema, and hidden treasures "
                f"that align with the user's demonstrated taste preferences."
            ),
            "explore": (
                f"Recommend {count} movies that explore NEW genres and styles outside the user's usual preferences. "
                f"Analyze which genres the user watches least or hasn't tried yet, "
                + (f"and recommend excellent movies in \"{params.get('target_genre', 'new genres')}\" that serve as great entry points. " if params.get('target_genre') else "and recommend excellent movies in those genres that serve as great entry points. ")  # noqa: E501
                + f"Choose films that are widely considered masterpieces in their respective genres."
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
                    return content[start : i + 1]

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

    def get_recommendations(
        self, movies: list[MediaRating], count: int = 5,
        strategy: str = "taste", strategy_params: Optional[dict] = None,
    ) -> list[MediaRecommendation]:
        """
        Generate movie recommendations (non-streaming).
        """
        prompt = self._build_prompt(movies, count, strategy, strategy_params)

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
                temperature=0.7,
                max_tokens=2000,
                timeout=60,
            )
        except AuthenticationError:
            raise ValueError(
                f"Authentication failed for {self.model_type}. Please check your API key."
            )
        except RateLimitError:
            raise ValueError(
                f"Rate limit exceeded for {self.model_type}. Please try again later."
            )
        except APITimeoutError:
            raise ValueError(
                f"Request to {self.model_type} timed out. Please try again."
            )
        except APIError as e:
            raise ValueError(
                f"{self.model_type} API error ({e.status_code}): {e.message}"
            )

        content = response.choices[0].message.content
        if not content:
            raise ValueError("Empty response from AI model")

        return self._parse_response(content)

    def _build_followup_prompt(
        self,
        movies: list[MediaRating],
        previous_recommendations: list,
        conversation: list,
        question: str,
        count: int,
    ) -> str:
        """Build the prompt for follow-up conversation."""
        movies_list = "\n".join(
            f"- {m.title}" + (f" ({m.year})" if m.year else "") +
            (f" [{m.genre}]" if m.genre else "") +
            f" \u2014 Rating: {m.rating}/10"
            for m in movies
        )

        recs_list = "\n".join(
            f"- {r.title}" + (f" ({r.year})" if r.year else "") +
            (f" [{r.genre}]" if r.genre else "") +
            f" \u2014 Confidence: {r.confidence*100:.0f}%" +
            f" \u2014 Reason: {r.reason}"
            for r in previous_recommendations
        )

        conv_history = "\n".join(
            f"{m.role}: {m.content}"
            for m in conversation
        )

        return f"""You are a professional movie recommendation expert in a conversation with a user.

The user has watched these movies with ratings (on a scale of 0-10):
{movies_list}

You previously recommended these movies:
{recs_list}

Conversation so far:
{conv_history}

The user now asks: {question}

Note: All ratings are on a 0-10 scale. 8/10 is very good, 5/10 is average, 2/10 is poor.
Use Chinese/localized titles for ALL movies where a Chinese title exists (e.g. "The Shawshank Redemption" → "肖申克的救赎", "Inception" → "盗梦空间"). Only use English titles for movies without a known Chinese translation.

Respond in Chinese for explanations, and use Chinese movie titles where available.

IMPORTANT: You must respond with valid JSON only, without markdown code blocks, in one of these two formats:

Format 1 - When the user asks for MORE RECOMMENDATIONS (recommend {count} new movies they haven't seen yet, different from previously recommended ones):
{{
    "type": "recommendations",
    "message": "Your Chinese message introducing the recommendations",
    "recommendations": [
        {{
            "title": "Movie Title",
            "year": 2024,
            "genre": "Sci-Fi / Action",
            "reason": "Why this movie in Chinese",
            "confidence": 0.85
        }}
    ]
}}

Format 2 - For explanation or other questions:
{{
    "type": "text",
    "message": "Your detailed Chinese response to the user's question"
}}
"""

    def get_followup_stream(
        self,
        movies: list[MediaRating],
        previous_recommendations: list,
        conversation: list,
        question: str,
        count: int = 3,
    ):
        """
        Generator that yields SSE-formatted events for follow-up conversation.

        Events:
          event: start\ndata: {{"model": "{model}"}}
          event: chunk\ndata: {{"text": "partial token..."}}
          event: result\ndata: {{...parsed JSON response...}}  # final structured result
          event: error\ndata: {{"message": "..."}}
        """
        prompt = self._build_followup_prompt(
            movies, previous_recommendations, conversation, question, count
        )

        # Yield start event
        start_data = json.dumps({"model": self.model_type})
        yield f"event: start\ndata: {start_data}\n\n"

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
                temperature=0.7,
                max_tokens=2000,
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

                # Try to parse the full JSON
                try:
                    json_str = self._extract_json(accumulated)
                    data = json.loads(json_str)

                    # Successfully parsed! Yield result event and stop.
                    result_data = json.dumps(data, ensure_ascii=False)
                    yield f"event: result\ndata: {result_data}\n\n"
                    return
                except (json.JSONDecodeError, ValueError):
                    pass

        # If we exhaust the stream without parsing, try one more time
        try:
            json_str = self._extract_json(accumulated)
            data = json.loads(json_str)
            result_data = json.dumps(data, ensure_ascii=False)
            yield f"event: result\ndata: {result_data}\n\n"
        except (json.JSONDecodeError, ValueError):
            # Fallback: yield accumulated as a text response
            fallback = json.dumps({
                "type": "text",
                "message": accumulated.strip() or "抱歉，AI 暂时无法回答这个问题，请换个方式试试。",
            }, ensure_ascii=False)
            yield f"event: result\ndata: {fallback}\n\n"

    def get_recommendations_stream(
        self, movies: list[MediaRating], count: int = 5,
        strategy: str = "taste", strategy_params: Optional[dict] = None,
    ):
        """
        Generator that yields SSE-formatted events as recommendations are streamed.

        Events:
          event: start\ndata: {{"model": "{model}", "source_count": {n}}}
          event: recommendation\ndata: {{...recommendation dict...}}
          event: done\ndata: {{"model_used": "{model}", "source_count": {n}, "total": {count}}}
          event: error\ndata: {{"message": "..."}}
        """
        prompt = self._build_prompt(movies, count, strategy, strategy_params)

        # Yield start event
        start_data = json.dumps({
            "model": self.model_type,
            "source_count": len(movies),
        })
        yield f"event: start\ndata: {start_data}\n\n"

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
                temperature=0.7,
                max_tokens=2000,
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
        last_rec_count = 0

        for chunk in stream:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                token = delta.content
                accumulated += token

                # Try to parse accumulated JSON progressively
                try:
                    json_str = self._extract_json(accumulated)
                    data = json.loads(json_str)
                    recs = data.get("recommendations", [])

                    # Yield any new recommendations found
                    while last_rec_count < len(recs):
                        rec = recs[last_rec_count]
                        rec_data = json.dumps({
                            "title": rec.get("title", "Unknown"),
                            "year": rec.get("year"),
                            "genre": rec.get("genre"),
                            "reason": rec.get("reason", ""),
                            "confidence": min(max(float(rec.get("confidence", 0.5)), 0.0), 1.0),
                        })
                        yield f"event: recommendation\ndata: {rec_data}\n\n"
                        last_rec_count += 1
                except (json.JSONDecodeError, ValueError):
                    pass

        # Yield done event with summary
        done_data = json.dumps({
            "model_used": self.model_type,
            "source_count": len(movies),
            "total": last_rec_count,
        })
        yield f"event: done\ndata: {done_data}\n\n"
