"""Chat pipeline: budget check, guardrails, semantic cache, memory, streamed
generation, then persistence.
"""
from __future__ import annotations

import asyncio
import contextlib
import datetime as dt
import hashlib
import json
import logging
import random
from collections.abc import AsyncIterator

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import session_scope
from app.models import (
    ChatbotMessage,
    ChatbotSemanticCache,
    ChatbotSession,
    GlobalResourceCounter,
    Guest,
    TokenUsageCounter,
)

from .guardrails import GuardrailsPipeline

logger = logging.getLogger(__name__)

# The Gemini SDK is imported lazily by the two functions that need it, so this
# module stays importable in a deployment without the intelligence service.
PRIMARY_MODEL = "gemini-2.0-flash"
FALLBACK_MODEL = "gemini-1.5-flash"
EMBEDDING_MODEL = "models/text-embedding-004"
MAX_RETRIES = 3
SIMILARITY_THRESHOLD = 0.85
HISTORY_LIMIT = 10

_SAFETY = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
]


class ChatRejected(Exception):
    """Refusal the user should see verbatim: over budget, blocked, throttled."""


def _sse(payload: dict) -> str:
    return "data: " + json.dumps(payload) + "\n\n"


def _cosine(a: list[float], b: list[float]) -> float:
    """Plain cosine similarity. scipy was pulled in for exactly this one line."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


async def _embed(text: str) -> list[float]:
    if not text or not settings.gemini_key:
        return []
    try:
        import google.generativeai as genai

        result = await asyncio.to_thread(
            genai.embed_content,
            model=EMBEDDING_MODEL,
            content=text,
            task_type="semantic_similarity",
        )
        return list(result["embedding"])
    except Exception as exc:
        logger.warning("Embedding failed, skipping cache: %s", exc)
        return []


class CostTracker:
    """Per-identifier daily token budget plus a global tokens-per-minute ceiling.

    Both counters are UPSERTed atomically. The Django version did
    get_or_create -> filter().update(F(...)) -> refresh_from_db, which is three
    round trips and races under concurrency.
    """

    def __init__(self, session: AsyncSession, identifier: str) -> None:
        self.session = session
        self.identifier = identifier

    async def check(self, estimated_tokens: int = 500) -> None:
        today = dt.date.today()
        used = await self.session.scalar(
            select(TokenUsageCounter.total_tokens).where(
                TokenUsageCounter.identifier == self.identifier,
                TokenUsageCounter.date_stamp == today,
            )
        )
        if (used or 0) + estimated_tokens > settings.user_daily_token_limit:
            raise ChatRejected("Daily message budget reached. Please try again tomorrow.")

        minute = dt.datetime.now(tz=dt.UTC).replace(second=0, microsecond=0)
        tpm = await self.session.scalar(
            select(GlobalResourceCounter.current_value).where(
                GlobalResourceCounter.resource_key == "gemini_tpm",
                GlobalResourceCounter.timestamp_minute == minute,
            )
        )
        if (tpm or 0) >= settings.global_tpm_limit:
            raise ChatRejected("Assistant is busy right now. Please retry in a minute.")

    async def record(self, tokens_used: int) -> None:
        from sqlalchemy.dialects.postgresql import insert

        today = dt.date.today()
        await self.session.execute(
            insert(TokenUsageCounter)
            .values(
                identifier=self.identifier,
                date_stamp=today,
                total_tokens=tokens_used,
                requests_count=1,
            )
            .on_conflict_do_update(
                index_elements=[TokenUsageCounter.identifier, TokenUsageCounter.date_stamp],
                set_={
                    "total_tokens": TokenUsageCounter.total_tokens + tokens_used,
                    "requests_count": TokenUsageCounter.requests_count + 1,
                },
            )
        )

        minute = dt.datetime.now(tz=dt.UTC).replace(second=0, microsecond=0)
        await self.session.execute(
            insert(GlobalResourceCounter)
            .values(resource_key="gemini_tpm", timestamp_minute=minute, current_value=tokens_used)
            .on_conflict_do_update(
                constraint="uq_res_ts",
                set_={"current_value": GlobalResourceCounter.current_value + tokens_used},
            )
        )


class SemanticCache:
    """Embedding-similarity cache over past replies."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, prompt: str, intent: str = "general") -> dict | None:
        embedding = await _embed(prompt)
        if not embedding:
            return None
        rows = (
            await self.session.execute(
                select(
                    ChatbotSemanticCache.id,
                    ChatbotSemanticCache.embedding,
                    ChatbotSemanticCache.reply_text,
                    ChatbotSemanticCache.action_response,
                )
                .where(ChatbotSemanticCache.intent_category == intent)
                .order_by(ChatbotSemanticCache.hits.desc())
                .limit(20)
            )
        ).all()

        best_id, best_score, best = None, 0.0, None
        for row_id, cached, reply, action in rows:
            score = _cosine(embedding, cached or [])
            if score > best_score:
                best_id, best_score, best = row_id, score, (reply, action)

        if best is None or best_score < SIMILARITY_THRESHOLD:
            return None

        await self.session.execute(
            update(ChatbotSemanticCache)
            .where(ChatbotSemanticCache.id == best_id)
            .values(hits=ChatbotSemanticCache.hits + 1)
        )
        return {"reply_text": best[0], "action_response": best[1] or {}}

    async def store(self, prompt: str, reply: str, action: dict, intent: str = "general") -> None:
        embedding = await _embed(prompt)
        if not embedding:
            return

        digest = hashlib.sha256(prompt.encode()).hexdigest()[:64]
        existing = await self.session.scalar(
            select(ChatbotSemanticCache.id).where(ChatbotSemanticCache.input_hash == digest)
        )
        if existing:
            await self.session.execute(
                update(ChatbotSemanticCache)
                .where(ChatbotSemanticCache.id == existing)
                .values(
                    embedding=embedding,
                    reply_text=reply,
                    action_response=action,
                    intent_category=intent,
                )
            )
        else:
            self.session.add(
                ChatbotSemanticCache(
                    input_hash=digest,
                    embedding=embedding,
                    reply_text=reply,
                    action_response=action,
                    intent_category=intent,
                )
            )


class Memory:
    """Conversation history, DB-backed with a Redis read-through.

    The Django version cached history in a module-level LRU dict, so two
    replicas disagreed about what had been said. Redis keeps it consistent and
    the DB stays the source of truth.
    """

    CACHE_TTL = 300

    def __init__(self, session: AsyncSession, session_id: str) -> None:
        self.session = session
        self.session_id = session_id
        self._key = f"chat:history:{session_id}"

    async def recent(self, limit: int = HISTORY_LIMIT) -> list[dict]:
        from app.core.cache import get_redis

        redis = await get_redis()
        if redis is not None:
            try:
                cached = await redis.get(self._key)
                if cached:
                    return json.loads(cached)
            except Exception as exc:
                logger.warning("History cache read failed: %s", exc)

        rows = (
            await self.session.scalars(
                select(ChatbotMessage)
                .where(ChatbotMessage.session_id == self.session_id)
                .order_by(ChatbotMessage.created_at.desc())
                .limit(limit)
            )
        ).all()
        # Gemini expects "model", not "assistant".
        history = [
            {"role": "user" if m.role == "user" else "model", "content": m.content}
            for m in reversed(rows)
        ]

        if redis is not None:
            try:
                await redis.setex(self._key, self.CACHE_TTL, json.dumps(history))
            except Exception as exc:
                logger.warning("History cache write failed: %s", exc)
        return history

    async def add(
        self, role: str, content: str, *, user_id: str | None, guest_id: str | None
    ) -> None:
        self.session.add(
            ChatbotMessage(
                session_id=self.session_id,
                user_id=user_id,
                guest_id=guest_id,
                role="user" if role == "user" else "assistant",
                content=content,
            )
        )
        from app.core.cache import get_redis

        redis = await get_redis()
        if redis is not None:
            with contextlib.suppress(Exception):
                await redis.delete(self._key)


def trim_history(history: list[dict], max_messages: int = HISTORY_LIMIT) -> list[dict]:
    """Sliding window plus middle-elision of very long turns, to bound tokens."""
    trimmed = []
    for message in history[-max_messages:]:
        content = message.get("content", "")
        if len(content) > 1000:
            content = f"{content[:400]}\n... [{len(content) - 800} chars elided] ...\n{content[-400:]}"
        trimmed.append({"role": message.get("role", "user"), "content": content})
    return trimmed


async def stream_completion(
    *,
    system_prompt: str,
    history: list[dict],
    user_message: str,
    image_b64: str | None = None,
    image_mime: str | None = None,
) -> AsyncIterator[str]:
    """Yield text chunks from Gemini, cascading to a fallback model on failure."""
    if not settings.gemini_key:
        raise ChatRejected("The assistant is not configured on this deployment.")

    import google.generativeai as genai

    formatted = [{"role": m["role"], "parts": [m["content"]]} for m in history]
    parts: list = [user_message]
    if image_b64 and image_mime:
        import base64

        try:
            parts.append({"mime_type": image_mime, "data": base64.b64decode(image_b64)})
        except Exception:
            logger.warning("Discarding unreadable image attachment")

    model_name = PRIMARY_MODEL
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            model = genai.GenerativeModel(
                model_name,
                system_instruction=system_prompt,
                safety_settings=_SAFETY,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.7, top_p=0.9, max_output_tokens=1024
                ),
            )
            chat = model.start_chat(history=formatted)
            stream = await chat.send_message_async(parts, stream=True)
            async for chunk in stream:
                text = getattr(chunk, "text", None)
                if text:
                    yield text
            return
        except Exception as exc:
            if attempt >= MAX_RETRIES:
                logger.error("Gemini exhausted %d attempts: %s", MAX_RETRIES, exc)
                raise ChatRejected("The assistant is temporarily unavailable.") from exc
            # Jittered backoff so a burst of clients does not retry in lockstep.
            wait = min(2**attempt + random.uniform(0.0, 1.0), 30.0)
            logger.warning("Gemini attempt %d failed (%s), retrying in %.1fs", attempt, exc, wait)
            await asyncio.sleep(wait)
            if attempt >= 2:
                model_name = FALLBACK_MODEL


class ChatPipeline:
    """Runs one chat turn through four layers, stopping at the first that answers.

        L1  guardrails      reject injection and abuse            (local)
        L2  intent parser   answer common questions from SQL      (local + 1 query)
        L3  semantic cache  reuse a near-identical past answer    (1 embedding)
        L4  model           everything else, streamed             (network)

    Most traffic stops at L2, which is the point: it is free, instant, and
    cannot invent a number. Only genuinely open questions reach the model.

    Opens its own database session, because the response streams after the
    request's dependencies are torn down.
    """

    def __init__(self, *, identifier: str, is_guest: bool, user=None) -> None:
        self.identifier = identifier
        self.is_guest = is_guest
        self.user = user

    async def run(
        self,
        message: str,
        *,
        live_context: str = "",
        image_b64: str | None = None,
        image_mime: str | None = None,
        context_tags: list | None = None,
    ) -> AsyncIterator[str]:
        from app.core.observability import chatbot_requests

        try:
            async with session_scope() as session:
                async for frame in self._turn(
                    session, message, live_context, image_b64, image_mime, context_tags
                ):
                    yield frame
        except ChatRejected as exc:
            chatbot_requests.labels("rejected").inc()
            yield _sse({"error": str(exc)})
        except Exception:
            chatbot_requests.labels("error").inc()
            logger.exception("Chat pipeline failed")
            yield _sse({"error": "Something went wrong. Please try again."})

    async def _turn(
        self,
        session: AsyncSession,
        message: str,
        live_context: str,
        image_b64: str | None,
        image_mime: str | None,
        context_tags: list | None,
    ) -> AsyncIterator[str]:
        from app.core.observability import chatbot_requests

        from .intents import parse
        from .prompts import build_system_prompt
        from .responders import answer, can_answer

        # L1 - guardrails.
        prompt = GuardrailsPipeline.verify_input(message)
        if not prompt:
            raise ChatRejected("Message was empty.")

        has_image = bool(image_b64 and image_mime)

        # L2 - deterministic. Signed-in users only, since it reads their NGO's
        # data. An image always needs the model, whatever the text says.
        if self.user is not None and not has_image:
            parsed = parse(prompt, role=self.user.role)
            if can_answer(parsed, self.user.role):
                reply = await answer(session, self.user, parsed)
                chatbot_requests.labels("intent").inc()
                async for frame in _emit(reply.text):
                    yield frame
                yield _sse(
                    {
                        "done": True,
                        "action": reply.action,
                        "calls": reply.calls,
                        "suggestions": reply.suggestions,
                        "source": "intent",
                        "intent": parsed.intent.value,
                    }
                )
                return

        # Past here we pay for the model, so the budget applies.
        cost = CostTracker(session, self.identifier)
        await cost.check(estimated_tokens=500)

        # L3 - semantic cache. Skipped for images, which are never comparable.
        cache = SemanticCache(session)
        cached = None if has_image else await cache.get(prompt)
        if cached is not None:
            chatbot_requests.labels("cache_hit").inc()
            async for frame in _emit(cached["reply_text"]):
                yield frame
            payload = cached["action_response"] or {}
            yield _sse(
                {
                    "done": True,
                    "action": payload.get("action", {"type": "none"}),
                    "calls": _allowed(payload.get("calls")),
                    "suggestions": payload.get("suggestions", []),
                    "source": "cache",
                }
            )
            return

        # L4 - model.
        chat_session = await self._session_for(session, context_tags)
        memory = Memory(session, chat_session.id)
        history = trim_history(await memory.recent())

        chunks: list[str] = []
        async for chunk in stream_completion(
            system_prompt=build_system_prompt(live_context),
            history=history,
            user_message=prompt,
            image_b64=image_b64,
            image_mime=image_mime,
        ):
            chunks.append(chunk)
            yield _sse({"textChunk": chunk})

        raw = GuardrailsPipeline.verify_output("".join(chunks))
        payload = _extract_action(raw)
        reply_text = _strip_action_block(raw)

        user_id = None if self.is_guest else self.identifier
        guest_id = self.identifier if self.is_guest else None
        await memory.add("user", prompt, user_id=user_id, guest_id=guest_id)
        await memory.add("assistant", reply_text, user_id=user_id, guest_id=guest_id)
        await cache.store(prompt, reply_text, payload)
        await cost.record(tokens_used=len(reply_text.split()) * 2)

        chatbot_requests.labels("model").inc()
        yield _sse(
            {
                "done": True,
                "action": payload.get("action", {"type": "none"}),
                "calls": _allowed(payload.get("calls")),
                "suggestions": payload.get("suggestions", []),
                "source": "model",
            }
        )

    async def _session_for(
        self, session: AsyncSession, context_tags: list | None
    ) -> ChatbotSession:
        column = ChatbotSession.guest_id if self.is_guest else ChatbotSession.user_id
        existing = await session.scalar(
            select(ChatbotSession)
            .where(column == self.identifier)
            .order_by(ChatbotSession.created_at.desc())
            .limit(1)
        )
        if existing is not None:
            return existing

        if self.is_guest and not await session.get(Guest, self.identifier):
            session.add(Guest(id=self.identifier))

        chat_session = ChatbotSession(
            user_id=None if self.is_guest else self.identifier,
            guest_id=self.identifier if self.is_guest else None,
            context_tags=context_tags or [],
        )
        session.add(chat_session)
        await session.flush()
        return chat_session


async def _emit(text: str, chunk_words: int = 3) -> AsyncIterator[str]:
    """Stream a ready-made answer in pieces, so the UI renders identically
    whether the text came from the parser, the cache, or the model."""
    words = text.split(" ")
    for start in range(0, len(words), chunk_words):
        yield _sse({"textChunk": " ".join(words[start : start + chunk_words]) + " "})


def _allowed(calls) -> list[dict]:
    """Drop any call that is not on the allowlist.

    The browser dispatches these by name against its API client, so an
    unfiltered list would let generated text choose which method runs.
    """
    from .responders import ALLOWED_CALLS, CONFIRM_CALLS

    if not isinstance(calls, list):
        return []
    permitted = ALLOWED_CALLS | CONFIRM_CALLS
    return [
        call
        for call in calls
        if isinstance(call, dict)
        and str(call.get("method", "")).removeprefix("api.") in permitted
    ]


def _strip_action_block(reply: str) -> str:
    """Remove the trailing ```json block so it never renders as chat text."""
    marker = reply.rfind("```json")
    return reply[:marker].rstrip() if marker != -1 else reply


def _extract_action(reply: str) -> dict:
    """Pull the optional trailing ```json action block the system prompt asks for."""
    marker = reply.rfind("```json")
    if marker == -1:
        return {}
    tail = reply[marker + 7 :]
    end = tail.find("```")
    if end == -1:
        return {}
    try:
        parsed = json.loads(tail[:end].strip())
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}
