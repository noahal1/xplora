"""AI response extraction and structured parsing helpers."""

import json
import re

from models import MediaRecommendation


class ParsingMixin:
    """AI response extraction and structured parsing helpers."""

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
