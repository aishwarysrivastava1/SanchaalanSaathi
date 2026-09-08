"""Deterministic answers for parsed intents.

Each responder answers from one aggregate query. Nothing here calls a model, so
these replies cost nothing, cannot hallucinate a number, and return in the time
of a single round trip.

`ALLOWED_CALLS` is the security boundary for the whole feature: the frontend
dispatches `api[method]` by name, so the set of names a reply may contain must
be fixed here rather than chosen by a language model.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Assignment, Resource, Task, TaskEnrollmentRequest, User

from .intents import Intent, ParsedIntent

# Read-only client methods the assistant may ask the UI to run.
ALLOWED_CALLS = frozenset({
    "ngoDashboard", "ngoTasks", "ngoVolunteers", "ngoResources", "ngoEvents",
    "ngoAnalytics", "ngoAlerts", "ngoNotifications", "ngoEnrollmentRequests",
    "volDashboard", "volTasks", "volOpenTasks", "volProfile",
    "volNotifications", "getRecommendations",
})

# Anything that changes state must be confirmed by the user in the UI first.
CONFIRM_CALLS = frozenset({
    "acceptAssignment", "rejectAssignment", "completeAssignment",
    "approveEnrollment", "rejectEnrollment", "createTask", "assignTasksOptimized",
})

ACTIVE = ("assigned", "accepted")


@dataclass(slots=True)
class Reply:
    text: str
    action: dict = field(default_factory=lambda: {"type": "none"})
    calls: list[dict] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)

    def sanitised(self) -> Reply:
        """Drop any call the allowlist does not permit."""
        self.calls = [
            call
            for call in self.calls
            if str(call.get("method", "")).removeprefix("api.")
            in (ALLOWED_CALLS | CONFIRM_CALLS)
        ]
        return self


ADMIN_SUGGESTIONS = [
    "How many open tasks?",
    "Show pending enrollment requests",
    "What needs urgent attention?",
]
VOLUNTEER_SUGGESTIONS = [
    "Show my assignments",
    "What tasks are open?",
    "Recommend tasks for me",
]


def _suggestions(role: str) -> list[str]:
    return ADMIN_SUGGESTIONS if role == "ngo_admin" else VOLUNTEER_SUGGESTIONS


def _plural(count: int, singular: str, plural: str | None = None) -> str:
    return f"{count} {singular if count == 1 else (plural or singular + 's')}"


async def _task_counts(session: AsyncSession, ngo_id: str) -> tuple[int, int, int, int]:
    row = (
        await session.execute(
            select(
                func.count(Task.id).filter(Task.status == "open"),
                func.count(Task.id).filter(Task.status == "in_progress"),
                func.count(Task.id).filter(Task.status == "completed"),
                func.count(Task.id),
            ).where(Task.ngo_id == ngo_id)
        )
    ).one()
    return int(row[0]), int(row[1]), int(row[2]), int(row[3])


async def _count_tasks(session: AsyncSession, user, parsed: ParsedIntent) -> Reply:
    if user.role == "volunteer":
        row = (
            await session.execute(
                select(
                    func.count(Assignment.id).filter(Assignment.status.in_(ACTIVE)),
                    func.count(Assignment.id).filter(Assignment.status == "completed"),
                ).where(Assignment.volunteer_id == user.user_id, Assignment.ngo_id == user.ngo_id)
            )
        ).one()
        return Reply(
            text=f"You have **{_plural(int(row[0]), 'active assignment')}** "
            f"and have completed **{int(row[1])}**.",
            action={"type": "navigate", "path": "/vol/tasks", "label": "View my tasks"},
            calls=[{"method": "api.volTasks", "args": []}],
            suggestions=_suggestions(user.role),
        )

    open_count, in_progress, completed, total = await _task_counts(session, user.ngo_id)
    status = parsed.slots.get("status")
    if status == "open":
        text = f"You have **{_plural(open_count, 'open task')}** waiting to be assigned."
    elif status == "completed":
        text = f"**{_plural(completed, 'task')}** completed so far."
    elif status == "in_progress":
        text = f"**{_plural(in_progress, 'task')}** currently in progress."
    else:
        text = (
            f"**{total} tasks** in total: {open_count} open, "
            f"{in_progress} in progress, {completed} completed."
        )
    return Reply(
        text=text,
        action={"type": "navigate", "path": "/ngo/tasks", "label": "Open task board"},
        calls=[{"method": "api.ngoTasks", "args": []}],
        suggestions=_suggestions(user.role),
    )


async def _count_volunteers(session: AsyncSession, user, parsed: ParsedIntent) -> Reply:
    row = (
        await session.execute(
            select(
                func.count(User.id),
                func.count(User.id).filter(User.profile_completed_at.is_not(None)),
            ).where(User.ngo_id == user.ngo_id, User.role == "volunteer")
        )
    ).one()
    total, onboarded = int(row[0]), int(row[1])
    return Reply(
        text=f"Your NGO has **{_plural(total, 'volunteer')}**, {onboarded} with a completed profile.",
        action={"type": "navigate", "path": "/ngo/volunteers", "label": "View volunteers"},
        calls=[{"method": "api.ngoVolunteers", "args": []}],
        suggestions=_suggestions(user.role),
    )


async def _list_tasks(session: AsyncSession, user, parsed: ParsedIntent) -> Reply:
    query = select(Task.title, Task.status, Task.priority).where(Task.ngo_id == user.ngo_id)
    if status := parsed.slots.get("status"):
        query = query.where(Task.status == status)
    rows = (
        await session.execute(query.order_by(Task.urgency_score.desc()).limit(5))
    ).all()

    if not rows:
        return Reply(
            text="No tasks match that yet. Create one from the task board to get started.",
            action={"type": "navigate", "path": "/ngo/tasks", "label": "Open task board"},
            suggestions=_suggestions(user.role),
        )

    listed = "\n".join(f"- **{title}** — {priority} priority, {status}" for title, status, priority in rows)
    return Reply(
        text=f"Here are your most urgent tasks:\n{listed}",
        action={"type": "navigate", "path": "/ngo/tasks", "label": "See all tasks"},
        calls=[{"method": "api.ngoTasks", "args": []}],
        suggestions=_suggestions(user.role),
    )


async def _list_volunteers(session: AsyncSession, user, parsed: ParsedIntent) -> Reply:
    rows = (
        await session.execute(
            select(User.full_name, User.email)
            .where(User.ngo_id == user.ngo_id, User.role == "volunteer")
            .limit(5)
        )
    ).all()
    if not rows:
        return Reply(
            text="No volunteers have joined yet. Share your invite code to bring them in.",
            action={"type": "navigate", "path": "/ngo/volunteers", "label": "Invite volunteers"},
            suggestions=_suggestions(user.role),
        )
    listed = "\n".join(f"- {name or email.split('@')[0]}" for name, email in rows)
    return Reply(
        text=f"Some of your volunteers:\n{listed}",
        action={"type": "navigate", "path": "/ngo/volunteers", "label": "View all"},
        calls=[{"method": "api.ngoVolunteers", "args": []}],
        suggestions=_suggestions(user.role),
    )


async def _my_assignments(session: AsyncSession, user, parsed: ParsedIntent) -> Reply:
    rows = (
        await session.execute(
            select(Task.title, Assignment.status, Task.deadline)
            .join(Assignment, Assignment.task_id == Task.id)
            .where(
                Assignment.volunteer_id == user.user_id,
                Assignment.ngo_id == user.ngo_id,
                Assignment.status.in_(ACTIVE),
            )
            .order_by(Task.deadline.asc().nulls_last())
            .limit(5)
        )
    ).all()
    if not rows:
        return Reply(
            text="You have no active assignments right now. Browse the open tasks to pick one up.",
            action={"type": "navigate", "path": "/vol/all-tasks", "label": "Browse open tasks"},
            calls=[{"method": "api.volOpenTasks", "args": []}],
            suggestions=_suggestions(user.role),
        )
    listed = "\n".join(
        f"- **{title}** — {status}" + (f", due {deadline:%d %b}" if deadline else "")
        for title, status, deadline in rows
    )
    return Reply(
        text=f"You have **{_plural(len(rows), 'active assignment')}**:\n{listed}",
        action={"type": "navigate", "path": "/vol/tasks", "label": "Open my tasks"},
        calls=[{"method": "api.volTasks", "args": []}],
        suggestions=_suggestions(user.role),
    )


async def _open_tasks(session: AsyncSession, user, parsed: ParsedIntent) -> Reply:
    if user.role == "volunteer":
        taken = select(Assignment.task_id).where(
            Assignment.volunteer_id == user.user_id, Assignment.status != "rejected"
        )
        rows = (
            await session.execute(
                select(Task.title, Task.priority)
                .where(Task.ngo_id == user.ngo_id, Task.status == "open", Task.id.not_in(taken))
                .order_by(Task.urgency_score.desc())
                .limit(5)
            )
        ).all()
        if not rows:
            return Reply(
                text="There are no open tasks you can pick up right now. Check back shortly.",
                suggestions=_suggestions(user.role),
            )
        listed = "\n".join(f"- **{title}** — {priority} priority" for title, priority in rows)
        return Reply(
            text=f"**{_plural(len(rows), 'task')}** you can pick up:\n{listed}",
            action={"type": "navigate", "path": "/vol/all-tasks", "label": "Browse open tasks"},
            calls=[{"method": "api.volOpenTasks", "args": []}],
            suggestions=_suggestions(user.role),
        )

    parsed.slots["status"] = "open"
    return await _list_tasks(session, user, parsed)


async def _recommendations(session: AsyncSession, user, parsed: ParsedIntent) -> Reply:
    return Reply(
        text="Pulling the tasks that best match your skills and availability.",
        action={"type": "navigate", "path": "/vol/all-tasks", "label": "See recommendations"},
        calls=[{"method": "api.getRecommendations", "args": []}],
        suggestions=_suggestions(user.role),
    )


async def _pending_enrollments(session: AsyncSession, user, parsed: ParsedIntent) -> Reply:
    pending = int(
        await session.scalar(
            select(func.count(TaskEnrollmentRequest.id)).where(
                TaskEnrollmentRequest.ngo_id == user.ngo_id,
                TaskEnrollmentRequest.status == "pending",
            )
        )
        or 0
    )
    if not pending:
        return Reply(
            text="No enrollment requests are waiting for review.",
            suggestions=_suggestions(user.role),
        )
    return Reply(
        text=f"**{_plural(pending, 'enrollment request')}** waiting for your review.",
        action={"type": "navigate", "path": "/ngo/volunteers", "label": "Review requests"},
        calls=[{"method": "api.ngoEnrollmentRequests", "args": []}],
        suggestions=_suggestions(user.role),
    )


async def _urgent_alerts(session: AsyncSession, user, parsed: ParsedIntent) -> Reply:
    rows = (
        await session.execute(
            select(Task.title, Task.status)
            .where(
                Task.ngo_id == user.ngo_id,
                Task.priority == "high",
                Task.status.in_(("open", "in_progress")),
            )
            .order_by(Task.urgency_score.desc())
            .limit(5)
        )
    ).all()
    if not rows:
        return Reply(
            text="Nothing is flagged high priority right now.",
            suggestions=_suggestions(user.role),
        )
    listed = "\n".join(f"- **{title}** ({status})" for title, status in rows)
    return Reply(
        text=f"**{_plural(len(rows), 'high-priority task')}** needing attention:\n{listed}",
        action={"type": "navigate", "path": "/ngo/dashboard", "label": "Open dashboard"},
        calls=[{"method": "api.ngoAlerts", "args": []}],
        suggestions=_suggestions(user.role),
    )


async def _resource_summary(session: AsyncSession, user, parsed: ParsedIntent) -> Reply:
    row = (
        await session.execute(
            select(
                func.count(Resource.id),
                func.coalesce(func.sum(Resource.quantity), 0),
                func.count(Resource.id).filter(Resource.availability_status == "available"),
            ).where(Resource.ngo_id == user.ngo_id)
        )
    ).one()
    kinds, units, available = int(row[0]), int(row[1]), int(row[2])
    if not kinds:
        return Reply(
            text="No resources are tracked yet. Add them from the resources page.",
            action={"type": "navigate", "path": "/ngo/resources", "label": "Add resources"},
            suggestions=_suggestions(user.role),
        )
    return Reply(
        text=f"**{_plural(kinds, 'resource type')}** tracked, {units} units total, {available} available.",
        action={"type": "navigate", "path": "/ngo/resources", "label": "Manage resources"},
        calls=[{"method": "api.ngoResources", "args": []}],
        suggestions=_suggestions(user.role),
    )


async def _leaderboard(session: AsyncSession, user, parsed: ParsedIntent) -> Reply:
    rows = (
        await session.execute(
            select(Assignment.volunteer_id, func.count(Assignment.id).label("done"))
            .where(Assignment.ngo_id == user.ngo_id, Assignment.status == "completed")
            .group_by(Assignment.volunteer_id)
            .order_by(func.count(Assignment.id).desc())
            .limit(3)
        )
    ).all()
    if not rows:
        return Reply(
            text="No completed assignments yet, so the leaderboard is empty.",
            suggestions=_suggestions(user.role),
        )
    names = {
        uid: (name or email.split("@")[0])
        for uid, name, email in (
            await session.execute(
                select(User.id, User.full_name, User.email).where(
                    User.id.in_([r[0] for r in rows])
                )
            )
        ).all()
    }
    listed = "\n".join(
        f"{rank}. **{names.get(uid, 'Unknown')}** — {_plural(int(done), 'task')} completed"
        for rank, (uid, done) in enumerate(rows, 1)
    )
    return Reply(
        text=f"Top volunteers:\n{listed}",
        action={"type": "navigate", "path": "/ngo/analytics", "label": "Full analytics"},
        suggestions=_suggestions(user.role),
    )


async def _greeting(session: AsyncSession, user, parsed: ParsedIntent) -> Reply:
    who = "there"
    if user.email:
        who = user.email.split("@")[0]
    role_line = (
        "I can pull up tasks, volunteers, resources and alerts for your NGO."
        if user.role == "ngo_admin"
        else "I can show your assignments, find open tasks, and suggest good matches."
    )
    return Reply(text=f"Hi {who}. {role_line}", suggestions=_suggestions(user.role))


async def _thanks(session: AsyncSession, user, parsed: ParsedIntent) -> Reply:
    return Reply(text="Anytime. Ask me whenever you need something.",
                 suggestions=_suggestions(user.role))


async def _help(session: AsyncSession, user, parsed: ParsedIntent) -> Reply:
    if user.role == "ngo_admin":
        text = (
            "Here is what I can do:\n"
            "- Count and list tasks by status\n"
            "- Show volunteers and pending enrollment requests\n"
            "- Surface high-priority work and resource levels\n"
            "- Take you to any page — try \"go to the map\"\n\n"
            "Ask anything else in plain language and I will work it out."
        )
    else:
        text = (
            "Here is what I can do:\n"
            "- Show your active assignments and deadlines\n"
            "- Find open tasks you can pick up\n"
            "- Recommend tasks that match your skills\n"
            "- Take you to any page — try \"go to my profile\"\n\n"
            "Ask anything else in plain language and I will work it out."
        )
    return Reply(text=text, suggestions=_suggestions(user.role))


async def _navigate(session: AsyncSession, user, parsed: ParsedIntent) -> Reply:
    page = parsed.slots.get("page", "that page")
    path = parsed.slots.get("path", "/")
    return Reply(
        text=f"Taking you to {page}.",
        action={"type": "navigate", "path": path, "label": f"Go to {page}"},
        suggestions=_suggestions(user.role),
    )


# Intents an NGO admin may answer, and those a volunteer may. Anything asked by
# the wrong role falls through to the model rather than leaking another view.
_ADMIN_ONLY = {
    Intent.COUNT_VOLUNTEERS, Intent.LIST_VOLUNTEERS, Intent.LIST_TASKS,
    Intent.PENDING_ENROLLMENTS, Intent.URGENT_ALERTS, Intent.RESOURCE_SUMMARY,
    Intent.LEADERBOARD,
}
_VOLUNTEER_ONLY = {Intent.RECOMMENDATIONS}

RESPONDERS = {
    Intent.GREETING: _greeting,
    Intent.THANKS: _thanks,
    Intent.HELP: _help,
    Intent.NAVIGATE: _navigate,
    Intent.COUNT_TASKS: _count_tasks,
    Intent.LIST_TASKS: _list_tasks,
    Intent.COUNT_VOLUNTEERS: _count_volunteers,
    Intent.LIST_VOLUNTEERS: _list_volunteers,
    Intent.MY_ASSIGNMENTS: _my_assignments,
    Intent.OPEN_TASKS: _open_tasks,
    Intent.RECOMMENDATIONS: _recommendations,
    Intent.PENDING_ENROLLMENTS: _pending_enrollments,
    Intent.URGENT_ALERTS: _urgent_alerts,
    Intent.RESOURCE_SUMMARY: _resource_summary,
    Intent.LEADERBOARD: _leaderboard,
}


def can_answer(parsed: ParsedIntent, role: str) -> bool:
    if not parsed.is_confident or parsed.intent not in RESPONDERS:
        return False
    if parsed.intent in _ADMIN_ONLY and role != "ngo_admin":
        return False
    if parsed.intent in _VOLUNTEER_ONLY and role != "volunteer":
        return False
    return True


async def answer(session: AsyncSession, user, parsed: ParsedIntent) -> Reply:
    return (await RESPONDERS[parsed.intent](session, user, parsed)).sanitised()
