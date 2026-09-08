"""Deterministic intent parser.

Runs before any network call. Most questions a coordinator actually asks are
narrow and repetitive ("how many open tasks", "show my assignments", "take me
to the map"), so answering them from a rule grammar is faster, free, and cannot
hallucinate. Only what this cannot classify reaches the semantic cache or the
model.

The grammar is scored, not first-match: every intent reports how well it fits
and the best score wins, so adding a new intent cannot silently shadow an
existing one.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from enum import StrEnum

CONFIDENT = 0.72
PHRASE_SCORE = 0.95
KEYWORD_SCORE = 0.78


class Intent(StrEnum):
    GREETING = "greeting"
    THANKS = "thanks"
    HELP = "help"
    COUNT_TASKS = "count_tasks"
    LIST_TASKS = "list_tasks"
    COUNT_VOLUNTEERS = "count_volunteers"
    LIST_VOLUNTEERS = "list_volunteers"
    MY_ASSIGNMENTS = "my_assignments"
    OPEN_TASKS = "open_tasks"
    RECOMMENDATIONS = "recommendations"
    PENDING_ENROLLMENTS = "pending_enrollments"
    URGENT_ALERTS = "urgent_alerts"
    RESOURCE_SUMMARY = "resource_summary"
    LEADERBOARD = "leaderboard"
    NAVIGATE = "navigate"
    UNKNOWN = "unknown"


@dataclass(slots=True)
class ParsedIntent:
    intent: Intent
    confidence: float
    slots: dict[str, str] = field(default_factory=dict)

    @property
    def is_confident(self) -> bool:
        return self.intent is not Intent.UNKNOWN and self.confidence >= CONFIDENT


# ── Normalisation ─────────────────────────────────────────────────────────────

_PUNCT = re.compile(r"[^\w\s]")
_SPACE = re.compile(r"\s+")

# Canonical vocabulary. Suffix folding is only accepted when it lands on one of
# these, which stops "volunteers" becoming "volunte" and "resources" becoming
# "resourc" -- the kind of silent mangling that makes a rule never fire.
VOCABULARY = {
    "task", "assignment", "volunteer", "resource", "enrollment", "event",
    "notification", "alert", "report", "skill", "leaderboard", "analytic",
    "dashboard", "map", "profile", "suggestion", "recommend", "match",
    "capability", "command", "guide", "help", "count", "list", "urgent",
    "priority", "open", "completed", "rank", "top", "best", "suit",
}

_SUFFIXES = ("ies", "es", "s")

_SYNONYMS = {
    "todo": "task",
    "job": "task",
    "duty": "task",
    "duties": "task",
    "helper": "volunteer",
    "staff": "volunteer",
    "people": "volunteer",
    "member": "volunteer",
    "supplies": "resource",
    "supply": "resource",
    "inventory": "resource",
    "stock": "resource",
    "request": "enrollment",
    "application": "enrollment",
    "ranking": "leaderboard",
    "emergency": "urgent",
    "critical": "urgent",
    "sos": "urgent",
    "unassigned": "open",
    "available": "open",
    "finished": "completed",
    "done": "completed",
    "complete": "completed",
    "closed": "completed",
    "ongoing": "in_progress",
    "active": "in_progress",
    "progress": "in_progress",
    "many": "count",
    "number": "count",
    "total": "count",
    "show": "list",
    "display": "list",
    "view": "list",
    "see": "list",
    "get": "list",
    "find": "list",
    "analytics": "analytic",
    "stats": "analytic",
    "statistics": "analytic",
}


def normalise(text: str) -> list[str]:
    """Lowercase, strip accents and punctuation, fold light plurals and synonyms."""
    folded = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    cleaned = _SPACE.sub(" ", _PUNCT.sub(" ", folded.lower())).strip()
    return [_canonical(word) for word in cleaned.split()]


def _canonical(raw: str) -> str:
    if (mapped := _SYNONYMS.get(raw)) is not None:
        return mapped
    if raw in VOCABULARY:
        return raw
    for suffix in _SUFFIXES:
        if not raw.endswith(suffix):
            continue
        stem = raw[: -len(suffix)]
        if suffix == "ies":
            stem += "y"
        if stem in VOCABULARY:
            return stem
        if (mapped := _SYNONYMS.get(stem)) is not None:
            return mapped
    # Fall back to a bare plural strip so unknown nouns still fold.
    if raw.endswith("s") and len(raw) > 3 and not raw.endswith("ss"):
        stem = raw[:-1]
        return _SYNONYMS.get(stem, stem)
    return raw


# ── Grammar ───────────────────────────────────────────────────────────────────
#
# Each rule scores a token set. `any_of` groups are OR within, AND across, so
# COUNT_TASKS needs a counting word AND a task word. `phrases` are exact
# multi-word hits that short-circuit to a high score.

@dataclass(frozen=True, slots=True)
class Rule:
    intent: Intent
    any_of: tuple[tuple[str, ...], ...] = ()
    phrases: tuple[str, ...] = ()
    # Tokens that disqualify this rule even on a phrase hit. "how many open
    # tasks" contains the phrase "open task" but is plainly a count question.
    blocked_by: tuple[str, ...] = ()

    def score(self, tokens: list[str], text: str) -> float:
        bag = set(tokens)
        if bag & set(self.blocked_by):
            return 0.0
        for phrase in self.phrases:
            if phrase in text:
                return PHRASE_SCORE
        if not self.any_of:
            return 0.0

        matched = sum(1 for group in self.any_of if bag & set(group))
        if matched < len(self.any_of):
            return 0.0
        # Full match. Short questions are more likely to mean exactly this.
        brevity = 0.1 if len(tokens) <= 6 else 0.0
        return KEYWORD_SCORE + brevity


COUNT = ("count", "many")
LIST = ("list", "what", "which", "my")
TASK = ("task", "assignment")
VOLUNTEER = ("volunteer",)

RULES: tuple[Rule, ...] = (
    Rule(Intent.GREETING, phrases=("hello", "hey there", "good morning", "good evening"),
         any_of=(("hi", "hello", "hey", "namaste", "yo"),)),
    Rule(Intent.THANKS, any_of=(("thanks", "thank", "thankyou", "thx", "cheers"),)),
    Rule(Intent.HELP, phrases=("what can you do", "how do you work", "what do you do"),
         any_of=(("help", "capability", "command", "guide"),)),

    Rule(Intent.COUNT_TASKS, any_of=(COUNT, TASK)),
    Rule(Intent.COUNT_VOLUNTEERS, any_of=(COUNT, VOLUNTEER)),

    Rule(Intent.MY_ASSIGNMENTS, phrases=("my assignment", "my task", "assigned to me"),
         any_of=(("my", "mine", "me"), TASK), blocked_by=("count",)),
    Rule(Intent.OPEN_TASKS, phrases=("open task", "available task", "unassigned task"),
         any_of=(("open",), TASK), blocked_by=("count",)),
    Rule(Intent.RECOMMENDATIONS, phrases=("recommend", "suggest", "best fit", "suited for me"),
         any_of=(("recommend", "suggestion", "suit", "match"),)),

    Rule(Intent.LIST_TASKS, any_of=(LIST, TASK)),
    Rule(Intent.LIST_VOLUNTEERS, any_of=(LIST, VOLUNTEER)),

    Rule(Intent.PENDING_ENROLLMENTS, phrases=("enrollment request", "join request", "who wants to join"),
         any_of=(("enrollment",),)),
    Rule(Intent.URGENT_ALERTS, phrases=("urgent task", "high priority", "what needs attention"),
         any_of=(("urgent", "alert", "priority"),)),
    Rule(Intent.RESOURCE_SUMMARY, any_of=(("resource",),)),
    Rule(Intent.LEADERBOARD, any_of=(("leaderboard", "top", "best", "rank"),)),
)

# Navigation is separate: it needs a destination slot, not just keywords.
# Keyed by canonical token (post-normalisation), so lookup is exact.
DESTINATIONS = {
    "dashboard": "dashboard",
    "home": "dashboard",
    "task": "tasks",
    "assignment": "tasks",
    "volunteer": "volunteers",
    "map": "map",
    "analytic": "analytics",
    "resource": "resources",
    "event": "events",
    "notification": "notifications",
    "profile": "profile",
}

# "open" is deliberately absent: it is far more often a task status
# ("show open tasks") than a navigation verb, and treating it as one made
# every status query resolve to a page jump.
NAV_VERBS = {"navigate", "take", "visit", "bring", "jump", "switch", "goto"}

# Phrasings that mean navigation regardless of the surrounding words.
NAV_PHRASES = ("take me to", "go to", "navigate to", "switch to", "jump to", "bring me to")

# "the X page" / "the X screen" is a navigation request whatever the verb.
NAV_NOUNS = {"page", "screen", "section", "tab", "view"}

ROUTES = {
    "ngo_admin": {
        "dashboard": "/ngo/dashboard",
        "tasks": "/ngo/tasks",
        "volunteers": "/ngo/volunteers",
        "map": "/ngo/map",
        "analytics": "/ngo/analytics",
        "resources": "/ngo/resources",
        "events": "/ngo/events",
        "notifications": "/ngo/notifications",
        "profile": "/ngo/profile",
    },
    "volunteer": {
        "dashboard": "/vol/dashboard",
        "tasks": "/vol/tasks",
        "analytics": "/vol/analytics",
        "notifications": "/vol/notifications",
        "profile": "/vol/profile",
    },
}


def _destination(tokens: list[str], role: str) -> dict[str, str] | None:
    routes = ROUTES.get(role, {})
    for token in tokens:
        page = DESTINATIONS.get(token)
        if page and page in routes:
            return {"page": page, "path": routes[page]}
    return None


def _status_slot(tokens: list[str]) -> str | None:
    for status in ("open", "in_progress", "completed", "cancelled"):
        if status in tokens:
            return status
    return None


def parse(text: str, *, role: str = "") -> ParsedIntent:
    """Classify a message. Returns UNKNOWN when nothing scores confidently."""
    if not text or not text.strip():
        return ParsedIntent(Intent.UNKNOWN, 0.0)

    tokens = normalise(text)
    flat = " ".join(tokens)
    bag = set(tokens)

    # Navigation needs an explicit phrase, or a movement verb with no competing
    # count/list intent. Without that second guard, "show open tasks" reads as a
    # request to open the tasks page.
    explicit = any(phrase in flat for phrase in NAV_PHRASES) or bool(bag & NAV_NOUNS)
    asking_about_data = bool(bag & {"count"})
    wants_navigation = explicit or (bag & NAV_VERBS and not asking_about_data)
    if wants_navigation and (destination := _destination(tokens, role)):
        return ParsedIntent(Intent.NAVIGATE, 0.92 if explicit else 0.85, destination)

    best = ParsedIntent(Intent.UNKNOWN, 0.0)
    for rule in RULES:
        score = rule.score(tokens, flat)
        if score > best.confidence:
            best = ParsedIntent(rule.intent, score)

    takes_status = best.intent in (Intent.COUNT_TASKS, Intent.LIST_TASKS, Intent.OPEN_TASKS)
    if takes_status and (status := _status_slot(tokens)):
        best.slots["status"] = status
    return best
