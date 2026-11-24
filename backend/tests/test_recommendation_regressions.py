"""Run from backend/: python -m unittest discover -s tests -v."""

import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import recommendation_session
from ai_service import AIService


def frame(event, data):
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


class HybridRecommendationTests(unittest.TestCase):
    def test_sync_hybrid_reaches_model_with_candidates_and_rag(self):
        service = AIService(api_key="test-key")
        candidate = {"title": "Candidate", "tmdb_id": "42", "year": 2020, "score": 1.0}
        response = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
            content=json.dumps({"recommendations": [
                {"title": "Candidate", "reason": "Fits the profile", "confidence": 0.8}
            ]})
        ))])
        rag_context = SimpleNamespace(to_prompt_context=lambda: "unique-rag-context")

        with (
            patch.object(service, "_build_tmdb_candidates", return_value=[candidate]),
            patch.object(service, "_resolve_metadata", side_effect=lambda recs: recs),
            patch.object(service, "_create_chat", return_value=response) as chat,
            patch.object(service, "_retry_loop", side_effect=AssertionError("Unexpected pure AI fallback")),
        ):
            recs = service.get_recommendations(
                [], count=1, strategy_params={"user_tmdb_ids": [("17", "movie")]},
                rag_context=rag_context,
            )

        self.assertEqual([rec.tmdb_id for rec in recs], ["42"])
        chat.assert_called_once()
        prompt = chat.call_args.kwargs["messages"][1]["content"]
        self.assertIn("Candidate", prompt)
        self.assertIn("unique-rag-context", prompt)


class RecommendationStreamTests(unittest.TestCase):
    def setUp(self):
        self.recommendation = {"title": "Candidate", "reason": "Fits the profile", "confidence": 0.8}
        self.item = frame("recommendation", self.recommendation)
        self.done = frame("done", {"total": 1})
        self.error = frame("error", {"message": "Provider failed"})

    def consume(self, events, stream=recommendation_session.stream_recommendations):
        with (
            patch.object(recommendation_session, "get_user_session") as open_db,
            patch.object(recommendation_session, "db_save_session") as save,
        ):
            actual = list(stream([], 1, "deepseek", "test-key", 17, source=lambda: iter(events)))
        self.assertEqual(actual, events)
        return open_db, save

    def test_error_or_early_eof_does_not_persist_partial_results(self):
        for events in ([self.item, self.error], [self.item], [self.item, self.error, self.done]):
            with self.subTest(events=events):
                open_db, save = self.consume(events)
                open_db.assert_not_called()
                save.assert_not_called()

    def test_done_persists_once(self):
        open_db, save = self.consume([self.item, self.done])
        open_db.assert_called_once_with(17)
        save.assert_called_once()
        self.assertEqual(save.call_args.kwargs["recommendations"][0].title, "Candidate")
        open_db.return_value.close.assert_called_once()

    def test_followup_result_persists_without_done(self):
        result = frame("result", {"type": "recommendations", "recommendations": [self.recommendation]})
        _, save = self.consume([result], recommendation_session.stream_followup)
        save.assert_called_once()
