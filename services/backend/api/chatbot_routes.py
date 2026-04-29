import json
import logging
import asyncio
import uuid
import re
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from db.base import get_db
from middleware.rbac import get_current_user_or_none, CurrentUser

from services.chatbot.observability import Tracer, request_id_var
from services.chatbot.queue import queue_manager
from services.chatbot.cost_control import DynamicCostTracker
from services.chatbot.guardrails import GuardrailsPipeline
from services.chatbot.cache import SemanticCache
from services.chatbot.memory import HybridMemory
from services.chatbot.llm import LLMOrchestrator
from services.chatbot.sessionCache import SessionCache
import api.metrics_routes as metrics

logger = logging.getLogger(__name__)

router = APIRouter()

SYSTEM_PROMPT = """You are Saathi, the Autonomous AI Assistant for Sanchaalan Saathi — an NGO volunteer and resource management platform.

## YOUR CAPABILITIES
You can answer questions AND autonomously execute platform actions on the user's behalf. When asked to do something on the platform, DO it by including the right API calls in your JSON block.

## RESPONSE FORMAT
Respond in plain conversational text. At the END, optionally append ONE ```json block:

```json
{
  "action": {"type": "navigate", "path": "/ngo/tasks", "label": "View Tasks"},
  "calls": [
    {"method": "api.someMethod", "args": ["arg1", "arg2"]}
  ],
  "suggestions": ["Follow-up question 1", "Follow-up question 2"]
}
```

- `action.type`: "navigate" to go to a page, or "none" to stay
- `calls`: list of API methods to run. Read-only calls auto-execute. Any call with "complete" in the name requires user confirmation.
- `suggestions`: 2–3 short follow-up prompts

## AVAILABLE API CALLS

### NGO Admin:
- `{"method": "api.ngoDashboard", "args": []}` — fetch dashboard stats
- `{"method": "api.ngoVolunteers", "args": []}` — list all volunteers
- `{"method": "api.ngoTasks", "args": []}` — list all tasks
- `{"method": "api.createTask", "args": [{"title":"TITLE","description":"DESC","required_skills":["skill"]}]}` — create a new task
- `{"method": "api.ngoAlerts", "args": []}` — get active alerts
- `{"method": "api.ngoResources", "args": []}` — list resources
- `{"method": "api.ngoAnalytics", "args": []}` — get analytics data
- `{"method": "api.assignTasksOptimized", "args": []}` — AI-assign tasks to best-matched volunteers
- `{"method": "api.ngoEnrollmentRequests", "args": []}` — get pending enrollment requests
- `{"method": "api.approveEnrollment", "args": ["ENROLLMENT_ID"]}` — approve a volunteer enrollment
- `{"method": "api.rejectEnrollment", "args": ["ENROLLMENT_ID"]}` — reject a volunteer enrollment
- `{"method": "api.ngoNotifications", "args": []}` — get NGO notifications
- `{"method": "api.pingTask", "args": ["TASK_ID", "optional message"]}` — ping volunteers on a task

### Volunteer:
- `{"method": "api.volDashboard", "args": []}` — fetch my dashboard
- `{"method": "api.volTasks", "args": []}` — get my assigned tasks
- `{"method": "api.volOpenTasks", "args": []}` — browse available open tasks
- `{"method": "api.getRecommendations", "args": []}` — AI-recommended tasks for me
- `{"method": "api.acceptAssignment", "args": ["ASSIGNMENT_ID"]}` — accept a task assignment
- `{"method": "api.rejectAssignment", "args": ["ASSIGNMENT_ID"]}` — decline a task assignment
- `{"method": "api.completeAssignment", "args": ["ASSIGNMENT_ID"]}` — mark assignment complete (requires confirmation)
- `{"method": "api.volProfile", "args": []}` — get my profile
- `{"method": "api.volNotifications", "args": []}` — get my notifications

## NAVIGATION PATHS
NGO: /ngo/dashboard  /ngo/tasks  /ngo/volunteers  /ngo/resources  /ngo/events  /ngo/analytics  /ngo/notifications  /ngo/map
Volunteer: /vol/dashboard  /vol/tasks  /vol/all-tasks  /vol/profile  /vol/notifications  /vol/analytics

## RULES
1. Use ONLY calls matching the user's role from context
2. Visitor role: answer questions only, no API calls
3. "complete" calls MUST be last in the calls array — they require user confirmation
4. Keep responses under 200 words
5. When asked to "show" data, include the read call AND navigate to the relevant page
6. Never discuss off-platform topics; redirect to platform tasks
7. Use IDs from context.activeTasks when available
8. Be proactive: if the user asks to manage something, fetch data AND navigate there
"""

class ChatMessagePayload(BaseModel):
    message: str
    imageBase64: str | None = None
    imageMimeType: str | None = None
    context: dict = {}

@router.post("")
async def chat_stream(
    req: ChatMessagePayload, 
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser | None = Depends(get_current_user_or_none)
):
    req_id = str(uuid.uuid4())
    request_id_var.set(req_id)
    
    consent = req.context.get("consent", False)
    
    # 1. Identity & Session Setup
    is_guest = user is None
    identifier = user.user_id if user else getattr(request.state, "guest_id", None)
    if not identifier:
        identifier = "anonymous_guest"
        is_guest = True

    with Tracer(name="chat_request", user_id=identifier) as trace:
        try:
            if consent:
                session = await SessionCache.get_or_create_session(db, identifier, is_guest)
                session_id = session.id
            else:
                session_id = f"ephemeral_{identifier}"
        except Exception as e:
            logger.error(f"Session creation failed, falling back to ephemeral: {e}")
            session_id = f"ephemeral_{identifier}"
            consent = False  # disable DB persistence for this request
            
        trace.session_id = session_id
        
        # 1.a Backpressure & Queueing limits with Session Fairness
        try:
            await queue_manager.acquire(identifier, session_id)
        except ValueError as e:
            trace.add_event("rejected", "Queue Throttled")
            return StreamingResponse(iter([f"data: {json.dumps({'error': str(e)})}\n\n"]), media_type="text/event-stream")

        # Generator boundary. 
        async def event_generator():
            try:
                # 2. Input Guardrails Pipeline (Zero LLM calls)
                with Tracer(name="guardrails", session_id=session_id) as grd_trace:
                    try:
                        safe_message = GuardrailsPipeline.verify_input(req.message)
                    except ValueError as e:
                        grd_trace.add_event("action", "blocked")
                        metrics.metric_guardrail_blocks += 1
                        yield f"data: {json.dumps({'error': str(e)})}\n\n"
                        return

                # 3. Cache & Cost Breaker Check (Global & Per-User)
                with Tracer(name="cache_check", session_id=session_id) as cc_trace:
                    if await DynamicCostTracker.is_cost_blocked(db):
                        cc_trace.add_event("circuit_breaker", "active")
                        yield f"data: {json.dumps({'error': 'System is busy conserving resources. Try again shortly.'})}\n\n"
                        return

                    # CHECK PER-USER BUDGET (New FAANG hardening)
                    if not await DynamicCostTracker.check_user_budget(db, identifier):
                        cc_trace.add_event("user_budget_exceeded", True)
                        yield f"data: {json.dumps({'error': 'Daily usage limit reached. Please try again tomorrow.'})}\n\n"
                        return

                    cached_hit = await SemanticCache.check_cache(db, safe_message)
                    if cached_hit:
                        cc_trace.add_event("cache_hit", True)
                        metrics.metric_cache_hits += 1 # Telemetry update
                        yield f"data: {json.dumps({'textChunk': cached_hit['text']})}\n\n"
                        yield f"data: {json.dumps({'action': cached_hit.get('action', {'type': 'none'}), 'done': True})}\n\n"
                        return
                    cc_trace.add_event("cache_hit", False)

                # Context Building
                ctx_lines = []
                if req.context.get("role"): ctx_lines.append(f"Role: {req.context.get('role')}")
                if req.context.get("activeTasks"): ctx_lines.append(f"Tasks: {json.dumps(req.context.get('activeTasks'))}")
                final_input = f"[Context: {' | '.join(ctx_lines)}]\n" + safe_message if ctx_lines else safe_message
                
                content_parts = [final_input]
                if req.imageBase64 and req.imageMimeType:
                    content_parts.append({"mime_type": req.imageMimeType, "data": req.imageBase64})

                # 4. Semantic History Memory Assembly
                if consent:
                    raw_history = await SessionCache.get_recent_messages(db, session_id, limit=30)
                else:
                    raw_history = []
                history = await HybridMemory.construct_relevance_history(raw_history, safe_message)
                formatted_history = [{"role": h["role"], "parts": [h["content"]]} for h in history]

                if consent:
                    # Async DB log
                    await SessionCache.append_message(db, session_id, "user", safe_message, user_id=identifier if not is_guest else None, guest_id=identifier if is_guest else None)

                # 5. LLM Fallback Orchestrator Execution
                with Tracer(name="llm_execution", session_id=session_id) as llm_trace:
                    response_iterator = await LLMOrchestrator.generate_response_stream(
                        formatted_history=formatted_history,
                        content_parts=content_parts,
                        system_instruction=SYSTEM_PROMPT
                    )
                    
                    full_response = ""
                    estimated_tokens = len(safe_message) // 4
                    
                    async for chunk in response_iterator:
                        text = chunk.text
                        if text:
                            full_response += text
                            estimated_tokens += len(text) // 4
                            yield f"data: {json.dumps({'textChunk': text})}\n\n"
                            
                    llm_trace.add_event("estimated_tokens", estimated_tokens)
                    # Deduct via Cost Tracker
                    await DynamicCostTracker.record_usage(db, identifier, session_id, estimated_tokens)

                # 6. Output Guardrails
                guarded_output = GuardrailsPipeline.verify_output(full_response)

                action, calls, suggestions = {"type": "none"}, [], []
                json_match = re.search(r'```json\s*(.*?)\s*```', guarded_output, re.DOTALL)
                if json_match:
                    try:
                        parsed = json.loads(json_match.group(1))
                        action = parsed.get("action", action)
                        calls = parsed.get("calls", calls)
                        suggestions = parsed.get("suggestions", suggestions)
                    except Exception: pass

                yield f"data: {json.dumps({'action': action, 'calls': calls, 'suggestions': suggestions, 'done': True})}\n\n"

                # 7. Update Session DB & Semantic Cache asynchronously
                if consent:
                    await SessionCache.append_message(db, session_id, "assistant", guarded_output, user_id=identifier if not is_guest else None, guest_id=identifier if is_guest else None)
                    # Stash generative outputs structurally back into vector layers avoiding future costs inherently
                    if not action or action.get('type') == 'none':
                        await SemanticCache.save_to_cache(db, safe_message, guarded_output, action)

            except asyncio.CancelledError:
                logger.warning("Streaming disconnected by client recursively.")
                metrics.metric_generator_partials += 1
                # PERSIST PARTIAL: Production requirement to save state even on exit
                if consent and 'full_response' in locals() and full_response:
                    await SessionCache.append_message(db, session_id, "assistant", full_response + " [DISCONNECTED]", user_id=identifier if not is_guest else None, guest_id=identifier if is_guest else None)
            except Exception as e:
                logger.error(f"Stream systemic error: {e}", exc_info=True)
                yield f"data: {json.dumps({'error': 'Platform currently unavailable. Retrying gracefully.'})}\n\n"
            finally:
                # Essential Queue Backpressure Release strictly mapping session IDs
                queue_manager.release(identifier, session_id)
                logger.info(f"Released queue slot for {identifier}")

    return StreamingResponse(event_generator(), media_type="text/event-stream")
