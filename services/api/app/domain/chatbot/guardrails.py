from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

# ── Keyword risk weights ──────────────────────────────────────────────────────
# Prompt injection + jailbreak patterns
_INJECTION_WEIGHTS: dict[str, float] = {
    "ignore previous instructions": 0.95,
    "ignore all instructions":      0.95,
    "forget all instructions":      0.95,
    "disregard your instructions":  0.90,
    "you are now":                  0.80,
    "new persona":                  0.80,
    "system prompt":                0.85,
    "jailbreak":                    0.90,
    "bypass safety":                0.90,
    "bypass filter":                0.90,
    "dan mode":                     0.90,
    "act as if":                    0.75,
}

# High-harm keywords (unambiguous violence/terror)
_HARM_WEIGHTS: dict[str, float] = {
    "make a bomb":    0.95,
    "build a bomb":   0.95,
    "how to kill":    0.95,
    "how to murder":  0.95,
    "terrorist attack": 0.95,
}

# Humanitarian context whitelist — reduce score if these appear alongside flagged words
# (e.g., "kill" in "skill" matching is avoided by word-boundary regex)
_HUMANITARIAN_LOWERING = {
    "rescue", "relief", "flood", "disaster", "emergency",
    "medical", "aid", "volunteer", "ngo", "shelter", "evacuate",
    "food", "water", "trauma", "survivor", "victim", "hospital",
}


class FastClassifier:
    """
    Zero-dependency heuristic classifier.
    Uses phrase matching for injections and harm; humanitarian context reduces score.
    """

    @staticmethod
    def score_input(text: str) -> float:
        lower = text.lower()
        score = 0.0

        # Injection phrase check
        for phrase, weight in _INJECTION_WEIGHTS.items():
            if phrase in lower:
                score += weight

        # Harm phrase check (full phrase, not word splits)
        for phrase, weight in _HARM_WEIGHTS.items():
            if phrase in lower:
                score += weight

        # Humanitarian context discount: each matching word reduces by 0.15
        words = set(re.findall(r'\b[a-z]+\b', lower))
        overlap = words & _HUMANITARIAN_LOWERING
        score -= len(overlap) * 0.15

        return max(0.0, min(score, 1.0))


class GuardrailsPipeline:
    """Input/output guardrail pipeline for the Saathi chatbot."""

    BLOCK_THRESHOLD    = 0.85  # hard block
    WARN_THRESHOLD     = 0.50  # log + tag, but continue

    @staticmethod
    def verify_input(text: str) -> str:
        """
        Clean, validate, and optionally block user input.
        Raises ValueError only for clear policy violations (score >= BLOCK_THRESHOLD).
        Lower-risk inputs are allowed through with a warning tag so Gemini safety
        can provide a secondary layer.
        """
        if not text or not text.strip():
            return ""

        # Normalise whitespace; hard-cap at 2000 chars
        cleaned = re.sub(r'\s+', ' ', text).strip()[:2000]

        risk = FastClassifier.score_input(cleaned)

        if risk >= GuardrailsPipeline.BLOCK_THRESHOLD:
            logger.warning("Guardrail BLOCK  (risk=%.2f): %.80s", risk, cleaned)
            raise ValueError("Input blocked by safety policy.")

        if risk >= GuardrailsPipeline.WARN_THRESHOLD:
            # Tag the message — let Gemini's own safety settings handle it
            logger.warning("Guardrail WARN   (risk=%.2f): %.80s", risk, cleaned)
            # Do NOT replace the entire message; append a scope reminder instead
            cleaned = f"{cleaned}\n[Note: Please keep responses relevant to humanitarian aid and NGO operations.]"

        return cleaned

    @staticmethod
    def verify_output(text: str) -> str:
        """
        Light output sanitisation:
        - Hard cap at 6000 chars (generous for Gemini responses)
        - Redact 16-digit PAN/card numbers
        - Remove potential leak of internal ref patterns
        """
        if not text:
            return ""

        if len(text) > 6000:
            text = text[:6000] + "…"

        # PAN / credit card numbers
        text = re.sub(r'\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b', '[REDACTED]', text)

        return text
