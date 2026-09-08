"""Chatbot layer tests.

The intent parser decides whether a request costs nothing or costs a model
call, so a silent regression here is expensive in both money and latency.
"""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("DB_PASSWORD", "test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-that-is-long-enough-32")

from app.domain.chatbot.intents import Intent, normalise, parse  # noqa: E402
from app.domain.chatbot.pipeline import _allowed, _extract_action, _strip_action_block  # noqa: E402
from app.domain.chatbot.responders import (  # noqa: E402
    ALLOWED_CALLS,
    CONFIRM_CALLS,
    Reply,
    can_answer,
)


class TestNormalisation:
    @pytest.mark.parametrize(
        "word,expected",
        [
            ("volunteers", "volunteer"),
            ("resources", "resource"),
            ("tasks", "task"),
            ("assignments", "assignment"),
            ("enrollments", "enrollment"),
            ("duties", "task"),
            ("supplies", "resource"),
            ("analytics", "analytic"),
        ],
    )
    def test_plurals_and_synonyms_fold_to_canonical_terms(self, word, expected):
        assert normalise(word) == [expected]

    def test_punctuation_and_accents_are_stripped(self):
        assert normalise("How many tasks?!") == ["how", "count", "task"]
        assert normalise("café") == ["cafe"]

    def test_suffix_folding_never_mangles_a_stem(self):
        """'volunteers' must not become 'volunte' -- that silently kills rules."""
        for word in ("volunteers", "resources", "notifications", "events"):
            assert all(len(token) >= 4 for token in normalise(word))


class TestIntentParsing:
    @pytest.mark.parametrize(
        "text,role,expected",
        [
            ("hi", "ngo_admin", Intent.GREETING),
            ("thanks!", "ngo_admin", Intent.THANKS),
            ("what can you do?", "ngo_admin", Intent.HELP),
            ("how many open tasks do I have?", "ngo_admin", Intent.COUNT_TASKS),
            ("how many completed tasks", "ngo_admin", Intent.COUNT_TASKS),
            ("how many volunteers", "ngo_admin", Intent.COUNT_VOLUNTEERS),
            ("list all volunteers", "ngo_admin", Intent.LIST_VOLUNTEERS),
            ("show me my tasks", "volunteer", Intent.MY_ASSIGNMENTS),
            ("what tasks are assigned to me", "volunteer", Intent.MY_ASSIGNMENTS),
            ("show open tasks", "volunteer", Intent.OPEN_TASKS),
            ("recommend tasks for me", "volunteer", Intent.RECOMMENDATIONS),
            ("take me to the map", "ngo_admin", Intent.NAVIGATE),
            ("go to analytics", "ngo_admin", Intent.NAVIGATE),
            ("open the resources page", "ngo_admin", Intent.NAVIGATE),
            ("any enrollment requests?", "ngo_admin", Intent.PENDING_ENROLLMENTS),
            ("what is urgent right now", "ngo_admin", Intent.URGENT_ALERTS),
            ("show inventory", "ngo_admin", Intent.RESOURCE_SUMMARY),
            ("who is top of the leaderboard", "ngo_admin", Intent.LEADERBOARD),
        ],
    )
    def test_common_questions_are_classified_confidently(self, text, role, expected):
        parsed = parse(text, role=role)
        assert parsed.intent is expected
        assert parsed.is_confident

    @pytest.mark.parametrize(
        "text",
        [
            "",
            "   ",
            "why did the flood relief operation fail last week",
            "draft a message to the district collector",
            "summarise the situation in ward 12 for my report",
        ],
    )
    def test_open_ended_questions_fall_through_to_the_model(self, text):
        assert parse(text, role="ngo_admin").intent is Intent.UNKNOWN

    def test_counting_beats_listing_when_both_could_match(self):
        """'how many open tasks' contains 'open task' but is a count question."""
        parsed = parse("how many open tasks", role="ngo_admin")
        assert parsed.intent is Intent.COUNT_TASKS
        assert parsed.slots["status"] == "open"

    def test_status_is_extracted_as_a_slot(self):
        assert parse("how many completed tasks", role="ngo_admin").slots["status"] == "completed"

    def test_navigation_resolves_a_role_appropriate_path(self):
        assert parse("go to the map", role="ngo_admin").slots["path"] == "/ngo/map"
        # Volunteers have no map page, so this must not resolve to the NGO one.
        assert parse("go to the map", role="volunteer").intent is not Intent.NAVIGATE

    def test_unknown_role_never_produces_a_navigation_path(self):
        assert parse("go to dashboard", role="").intent is not Intent.NAVIGATE


class TestActionSafety:
    """The browser dispatches `api[method]` by name, so the server decides
    which names are permitted. Generated text must never widen that set."""

    def test_unlisted_methods_are_dropped(self):
        calls = [
            {"method": "api.ngoTasks", "args": []},
            {"method": "api.deleteEverything", "args": []},
            {"method": "api.__proto__", "args": []},
        ]
        assert _allowed(calls) == [{"method": "api.ngoTasks", "args": []}]

    def test_malformed_call_lists_are_rejected(self):
        assert _allowed(None) == []
        assert _allowed("ngoTasks") == []
        assert _allowed([1, 2, 3]) == []
        assert _allowed([{"no_method": True}]) == []

    def test_state_changing_calls_are_allowed_but_flagged_for_confirmation(self):
        assert "completeAssignment" in CONFIRM_CALLS
        assert "completeAssignment" not in ALLOWED_CALLS
        assert _allowed([{"method": "api.completeAssignment", "args": ["a1"]}])

    def test_reply_sanitises_its_own_calls(self):
        reply = Reply(text="hi", calls=[{"method": "api.rmRf"}, {"method": "api.volTasks"}])
        assert reply.sanitised().calls == [{"method": "api.volTasks"}]


class TestReplyParsing:
    def test_action_block_is_extracted(self):
        raw = 'Here you go.\n```json\n{"action": {"type": "navigate"}}\n```'
        assert _extract_action(raw) == {"action": {"type": "navigate"}}

    def test_action_block_is_stripped_from_visible_text(self):
        raw = 'Here you go.\n```json\n{"action": {}}\n```'
        assert _strip_action_block(raw) == "Here you go."

    def test_text_without_an_action_block_is_untouched(self):
        assert _strip_action_block("Just an answer.") == "Just an answer."
        assert _extract_action("Just an answer.") == {}

    def test_malformed_json_does_not_raise(self):
        assert _extract_action("text\n```json\n{oops}\n```") == {}


class TestRoleScoping:
    def test_a_volunteer_cannot_trigger_admin_only_intents(self):
        for text in ("how many volunteers", "show inventory", "enrollment requests"):
            parsed = parse(text, role="volunteer")
            assert not can_answer(parsed, "volunteer"), text

    def test_an_admin_gets_admin_intents(self):
        parsed = parse("how many volunteers", role="ngo_admin")
        assert can_answer(parsed, "ngo_admin")

    def test_unclassified_input_is_never_answered_deterministically(self):
        parsed = parse("write a press release about the flood", role="ngo_admin")
        assert not can_answer(parsed, "ngo_admin")
