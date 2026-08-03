"""Prompt building for all recommendation strategies and follow-ups."""

from typing import Optional

from models import MediaRating
from scraper.match import has_cjk


class PromptMixin:
    """Prompt building for all recommendation strategies and follow-ups."""

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
        previous_feedback: Optional[dict] = None,
        filtered_titles_info: Optional[list[tuple[str, str]]] = None,
        candidates: Optional[list[dict]] = None,
    ) -> str:
        """Build an optimized prompt for the AI model.

        Two modes:

        **Pure AI mode** (default, ``candidates=None``):
        - Uses a compact sample of top-15 movies as concrete examples
        - Includes exclusion list, retry hints, and previous feedback
          for dynamic retry loop
        - Automatically detects CJK / English for title language

        **Hybrid mode** (``candidates`` provided):
        - TMDB candidate list replaces the sample movies
        - Exclusion list / retry / feedback sections are skipped
          (candidates are already pre-filtered)
        - Titles are always in Chinese
        """
        # ── Shared: taste analysis + strategy instruction ────────────
        taste_summary = ""
        if taste_analysis:
            taste_summary = self._build_taste_summary(taste_analysis)

        strategy_instruction = self._get_strategy_instruction(strategy, strategy_params, count)
        total_count = len(movies)

        # ── Media type guidance ──────────────────────────────────────
        target_media_type = (strategy_params or {}).get("media_type", "")
        media_type_instruction = ""
        if target_media_type == "movie":
            media_type_instruction = "\n\nIMPORTANT: Only recommend MOVIES. Do NOT recommend TV shows."
        elif target_media_type == "tv":
            media_type_instruction = "\n\nIMPORTANT: Only recommend TV SHOWS. Do NOT recommend movies."

        # ── Playlist fill context (playlist strategy) ────────────────
        playlist_section = ""
        if strategy == "playlist":
            pname = (strategy_params or {}).get("playlist_name", "")
            pdesc = (strategy_params or {}).get("playlist_description", "")
            pitems = (strategy_params or {}).get("playlist_items", [])
            p_items_desc = "、".join(
                (i.get("title") or "") + (f" ({i.get('year')})" if i.get("year") else "")
                for i in pitems[:20]
            )
            if len(pitems) > 20:
                p_items_desc += "…"
            playlist_section = (
                f"\n## 目标片单「{pname}」\n"
                + (f"描述: {pdesc}\n" if pdesc else "")
                + f"现有条目: {p_items_desc or '（空）'}\n"
            )

        # ── Branch: hybrid mode (TMDB candidates) vs pure AI ────────
        is_hybrid = candidates is not None

        if is_hybrid:
            # ── Hybrid mode: candidate-based prompt ──────────────────
            candidates_sample = candidates[:30]
            candidates_list = "\n".join(
                f"{i+1}. \"{c['title']}\""
                + (f" ({c['year']})" if c.get("year") else "")
                + (f" [{c['genre']}]" if c.get("genre") else "")
                + (f" TMDB评分: {c.get('vote_average', 'N/A')}" if c.get('vote_average') else "")
                + f" — 来自{int(round(c['score']))}部电影推荐"
                for i, c in enumerate(candidates_sample)
            )

            return f"""You are a professional movie recommendation expert. Below is a list of candidate movies that TMDB's algorithm identified as similar to what the user has watched and enjoyed. Your task is to select the BEST movies from this list and write personalized recommendations for each.

## User's Taste Profile
Total watched movies: {total_count}.

## Taste Analysis
{taste_summary or "No taste analysis available."}

## Candidate Movies (from TMDB collaborative filtering)
These are movies that fans of the user's favorite films also enjoy:
{candidates_list}{playlist_section}

## Strategy Instruction
{strategy_instruction}

## Additional Requirements
1. ONLY select from the candidate list above — do NOT recommend movies outside this list
2. Each recommendation MUST include a personalized reason referencing the user's specific taste
3. Confidence score (0-1) should reflect how well the movie matches the user's taste
4. Ensure diversity in genre, era, and style
5. The reason MUST be in Chinese
6. Use Chinese/localized titles where available{media_type_instruction}

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
}}"""

        # ── Pure AI mode (default) ────────────────────────────────────
        # Compact sample: top 15 highest-rated movies as concrete examples
        movies_sorted = sorted(movies, key=lambda m: m.rating or 0, reverse=True)
        sample = movies_sorted[:15]
        movies_list = "\n".join(
            f"- {m.title}" + (f" ({m.year})" if m.year else "") +
            (f" [{m.genre}]" if m.genre else "") +
            f" — Rating: {m.rating}/10"
            for m in sample
        )

        # Retry hint — tells the AI which of its previous suggestions were filtered and why
        retry_hint = ""
        if retry_attempt > 0:
            if filtered_titles_info:
                filtered_details = "\n".join(
                    f'  - "{title}" → {reason}'
                    for title, reason in filtered_titles_info
                )
                retry_hint = (
                    f"\n\nNote: This is retry #{retry_attempt}. Your previous suggestions "
                    f"were filtered out because the user has already seen or wishlisted them:\n"
                    f"{filtered_details}\n\n"
                    f"Please recommend DIFFERENT movies this time. Be more creative — "
                    f"avoid the user's existing library and the exclusion list below."
                )
            else:
                retry_hint = (
                    f"\n\nNote: This is retry #{retry_attempt}. Your previous suggestions were "
                    f"all movies the user has already seen. Please recommend DIFFERENT movies "
                    f"this time, being extra careful to avoid the exclusion list below."
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
{exclude_list}"""

        # Previous recommendation feedback (P2: 反馈闭环)
        feedback_section = ""
        if previous_feedback:
            liked = previous_feedback.get("liked_titles", [])
            ignored = previous_feedback.get("ignored_titles", [])
            feedback_parts = []
            if liked:
                liked_list = "\n".join(f'  ✅ {t}' for t in liked[:10])
                feedback_parts.append(
                    f"用户之前对这些推荐感兴趣并加入了想看列表（说明用户喜欢这类电影）：\n{liked_list}"
                )
                if len(liked) > 10:
                    feedback_parts.append(f"  ... 以及另外 {len(liked) - 10} 部")
            if ignored:
                ignored_list = "\n".join(f'  ❌ {t}' for t in ignored[:10])
                feedback_parts.append(
                    f"用户之前对这些推荐没有采取行动（可能不太感兴趣），请避免推荐类似电影：\n{ignored_list}"
                )
                if len(ignored) > 10:
                    feedback_parts.append(f"  ... 以及另外 {len(ignored) - 10} 部")
            if feedback_parts:
                feedback_section = "\n\n## Previous Recommendation Feedback\n" + "\n\n".join(feedback_parts)

        # Language-adaptive title instruction
        cjk_in_sample = sum(1 for m in sample if has_cjk(m.title))
        use_cjk_titles = cjk_in_sample > len(sample) / 2

        if use_cjk_titles:
            title_instruction = (
                "Use Chinese/localized titles for ALL movies where a Chinese title "
                'exists (e.g. "The Shawshank Redemption" → "肖申克的救赎", '
                '"Inception" → "盗梦空间"). '
                "Only use English titles for movies without a known Chinese translation."
            )
            json_title_hint = "Movie Title (use Chinese title if available)"
        else:
            title_instruction = (
                "Use original English titles for ALL movies. "
                'Do NOT translate titles to Chinese (e.g. "肖申克的救赎" → '
                '"The Shawshank Redemption", "盗梦空间" → "Inception"). '
                "Only use Chinese titles for movies that do not have an English original title."
            )
            json_title_hint = "Movie Title (use English original title)"

        return f"""You are a professional movie recommendation expert. Based on the movies the user has watched and their ratings, recommend NEW movies they haven't seen.

## User's Taste Profile
Total watched movies: {total_count}. Below is a sample of {len(sample)} highest-rated movies:
{movies_list}

## Taste Analysis
{taste_summary or "No taste analysis available."}
{exclude_section}{retry_hint}{feedback_section}

{strategy_instruction}

{playlist_section}
## Additional Requirements
1. Each recommendation MUST include a personalized reason that references the user's specific taste (genres they rate highly, preferred eras, etc.)
2. Confidence score (0-1) should reflect how well the movie matches the user's demonstrated taste
3. DIVERSITY: Do NOT recommend multiple movies from the same franchise, same director (unless the user clearly loves that director), or same series
4. {title_instruction}
5. The reason MUST be in Chinese
6. Ensure recommendations are genuinely diverse in genre, era, and style{media_type_instruction}

Respond with ONLY valid JSON in the following format, without any markdown formatting or code blocks:
{{
    "recommendations": [
        {{
            "title": "{json_title_hint}",
            "year": 2024,
            "genre": "Sci-Fi / Action",
            "reason": "Recommendation reason in Chinese, referencing user's taste",
            "confidence": 0.85
        }}
    ]
}}"""


    def _get_strategy_instruction(self, strategy: str, params: Optional[dict] = None, count: int = 5) -> str:
        """Get strategy-specific instructions for the AI prompt."""
        params = params or {}

        # Playlist items description (used by the "playlist" strategy) —
        # derived inline so it's available regardless of when this is called.
        playlist_items = params.get("playlist_items") or []
        playlist_items_desc = "、".join(
            (i.get("title") or "") + (f" ({i.get('year')})" if i.get("year") else "")
            for i in playlist_items[:20]
        )
        if len(playlist_items) > 20:
            playlist_items_desc += "…"
        playlist_items_desc = playlist_items_desc or "（空）"

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
            "playlist": (
                f"Fill out the user's playlist 「{params.get('playlist_name', '')}」. "
                + (f"Playlist description: {params.get('playlist_description', '')}. " if params.get("playlist_description") else "")
                + f"The playlist currently contains: {playlist_items_desc}. "
                + f"Recommend {count} movies/shows that BEST complete this playlist's theme. "
                + f"Do NOT recommend anything already in the playlist. "
                + f"Each reason should explain why the title belongs in this specific playlist."
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
{exclude_list}"""

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
