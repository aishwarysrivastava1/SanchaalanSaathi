"""Demo data for the one-click guest sessions.

Each guest click writes roughly 35 rows and nothing removes them, so the
endpoint is rate limited and docs/sql/reap-guest-data.sql expires old ones.
"""
from __future__ import annotations

import random
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models import (
    Assignment,
    Event,
    Notification,
    Resource,
    Task,
    User,
    VolunteerProfile,
    utcnow,
)

WEEKDAYS = {"mon": True, "tue": True, "wed": True, "thu": True, "fri": True, "sat": False, "sun": False}

_VOLUNTEERS = [
    ("Amit Kumar", "amit", ["medical_aid", "search_rescue"], "Mumbai", 4),
    ("Priya Sharma", "priya", ["logistics", "water_purification"], "Delhi", 3),
    ("Rahul Singh", "rahul", ["logistics", "community_outreach"], "Pune", 6),
    ("Meera Patel", "meera", ["medical_aid", "teaching"], "Bangalore", 2),
    ("Arjun Nair", "arjun", ["search_rescue", "structural_assessment"], "Chennai", 5),
]

_ADMIN_TASKS = [
    ("Flood Relief - Food Distribution", "Distribute food packets.", ["logistics", "community_outreach"], "high", "open", 3, 19.040, 72.854),
    ("Medical Camp Setup", "Set up emergency triage camp.", ["medical_aid"], "high", "in_progress", 2, 19.076, 72.877),
    ("Drinking Water Distribution", "Distribute purified water.", ["logistics", "water_purification"], "medium", "open", 1, 19.052, 72.852),
    ("Rescue Operations - Rooftop", "Rescue stranded persons.", ["search_rescue"], "high", "in_progress", 1, 19.062, 72.833),
    ("Temporary Shelter Construction", "Build shelters.", ["structural_assessment"], "high", "completed", -3, 19.035, 72.849),
    ("Flood Safety Awareness Drive", "Safety sessions.", ["teaching", "community_outreach"], "low", "open", 7, 19.048, 72.862),
    ("Damage Assessment Survey", "Survey households.", ["community_outreach"], "medium", "in_progress", 4, 19.057, 72.841),
    ("Medical Supply Convoy", "Distribute medical supplies.", ["medical_aid", "logistics"], "high", "open", 2, 19.069, 72.869),
]

_ASSIGNMENT_PLAN = [
    (0, 0, "accepted"), (1, 1, "accepted"), (2, 2, "assigned"), (3, 3, "accepted"),
    (4, 4, "completed"), (5, 0, "assigned"), (6, 1, "accepted"), (7, 2, "assigned"),
]

_EVENTS = [
    ("Flood Relief Mega Drive", "Large-scale relief.", "drive", 7, "Dharavi, Mumbai", 100),
    ("Medical Awareness & Free Camp", "Free checkups.", "camp", 4, "Kurla East, Mumbai", 50),
    ("Volunteer First Aid Training", "First-aid certification.", "training", 14, "NGO HQ", 30),
    ("Environmental Cleanup Drive", "Post-flood cleanup.", "drive", 21, "Bandra West, Mumbai", 80),
]

_RESOURCES = [
    ("Medical Kits", 50, "available"), ("Water Purification Tablets", 200, "available"),
    ("Food Packages", 150, "in_use"), ("Rescue Boats", 8, "in_use"),
    ("Temporary Shelters", 25, "available"), ("First Aid Boxes", 40, "available"),
]

_ADMIN_NOTIFICATIONS = [
    ("Priya Sharma accepted the Drinking Water Distribution task.", "status_update"),
    ("New volunteer joined your NGO: Meera Patel.", "general"),
    ("Task Medical Camp Setup is 80% complete.", "status_update"),
    ("Resource alert: Food Packages running low.", "general"),
    ("Upcoming event: Flood Relief Mega Drive in 7 days.", "general"),
    ("Rahul Singh completed Temporary Shelter Construction.", "status_update"),
]


async def seed_ngo_demo(session: AsyncSession, admin_user_id: str, ngo_id: str) -> None:
    now = utcnow()
    demo_password = hash_password("demo-guest-account-not-for-login")

    volunteer_ids: list[str] = []
    for name, suffix, skills, city, years in _VOLUNTEERS:
        user = User(
            email=f"demo_{suffix}_{ngo_id[:6]}@guest.invalid",
            password_hash=demo_password,
            role="volunteer",
            ngo_id=ngo_id,
            full_name=name,
            profile_completed_at=now,
        )
        session.add(user)
        await session.flush()
        session.add(
            VolunteerProfile(
                user_id=user.id,
                ngo_id=ngo_id,
                skills=skills,
                availability=dict(WEEKDAYS),
                full_name=name,
                city=city,
                languages=["English", "Hindi"],
                causes_supported=["Disaster Relief", "Healthcare"],
                bio="Dedicated volunteer. Highly reliable.",
                years_experience=years,
                profile_completeness_score=0.85,
            )
        )
        volunteer_ids.append(user.id)

    task_ids: list[str] = []
    for title, desc, skills, priority, status, days, lat, lng in _ADMIN_TASKS:
        task = Task(
            ngo_id=ngo_id,
            title=title,
            description=desc,
            required_skills=skills,
            priority=priority,
            status=status,
            deadline=now + timedelta(days=days),
            lat=lat,
            lng=lng,
            urgency_score=90 if priority == "high" else 55,
        )
        session.add(task)
        await session.flush()
        task_ids.append(task.id)

    for task_index, volunteer_index, status in _ASSIGNMENT_PLAN:
        assignment = Assignment(
            task_id=task_ids[task_index],
            volunteer_id=volunteer_ids[volunteer_index],
            ngo_id=ngo_id,
            status=status,
        )
        if status == "completed":
            assignment.accepted_at = now - timedelta(days=4)
            assignment.completed_at = now - timedelta(days=2)
        elif status == "accepted":
            assignment.accepted_at = now - timedelta(hours=random.randint(2, 48))
        session.add(assignment)

    for title, desc, event_type, days, location, max_volunteers in _EVENTS:
        session.add(
            Event(
                ngo_id=ngo_id,
                title=title,
                description=desc,
                event_type=event_type,
                date=now + timedelta(days=days),
                location=location,
                max_volunteers=max_volunteers,
                status="upcoming",
            )
        )

    for resource_type, quantity, status in _RESOURCES:
        session.add(
            Resource(ngo_id=ngo_id, type=resource_type, quantity=quantity, availability_status=status)
        )

    for message, kind in _ADMIN_NOTIFICATIONS:
        session.add(Notification(user_id=admin_user_id, message=message, type=kind))


_VOLUNTEER_OPEN_TASKS = [
    ("Flood Relief - Food Distribution", "Distribute food packets.", ["logistics"], "high", 1, 19.040, 72.854),
    ("Medical Supply Convoy", "Escort medical supplies.", ["medical_aid"], "high", 2, 19.069, 72.869),
    ("Flood Safety Awareness Drive", "Safety sessions.", ["teaching"], "low", 5, 19.048, 72.862),
    ("Community Kitchen Volunteer", "Cook and serve meals.", ["cooking"], "medium", 3, 19.055, 72.845),
    ("Water Distribution - Zone 4", "Distribute water.", ["logistics"], "medium", 2, 19.061, 72.858),
]

_VOLUNTEER_ASSIGNED_TASKS = [
    ("Rescue Operations - Rooftop", "Rescue stranded persons.", ["search_rescue"], "high", "accepted", 1, 19.062, 72.833),
    ("Damage Assessment Survey", "Survey households.", ["community_outreach"], "medium", "assigned", 3, 19.057, 72.841),
    ("Temporary Shelter Construction", "Build shelters.", ["structural_assessment"], "high", "completed", -2, 19.035, 72.849),
]

_VOLUNTEER_NOTIFICATIONS = [
    ("You have been assigned: Rescue Operations - Rooftop.", "task_assigned"),
    ("Your task Temporary Shelter Construction was verified.", "status_update"),
    ("Upcoming event: Flood Relief Mega Drive in 7 days.", "general"),
    ("Your profile is 85% complete.", "general"),
]


async def seed_volunteer_demo(session: AsyncSession, volunteer_user_id: str, ngo_id: str) -> None:
    now = utcnow()

    for title, desc, skills, priority, days, lat, lng in _VOLUNTEER_OPEN_TASKS:
        session.add(
            Task(
                ngo_id=ngo_id,
                title=title,
                description=desc,
                required_skills=skills,
                priority=priority,
                status="open",
                deadline=now + timedelta(days=days),
                lat=lat,
                lng=lng,
                urgency_score=88 if priority == "high" else 55,
            )
        )

    for title, desc, skills, priority, status, days, lat, lng in _VOLUNTEER_ASSIGNED_TASKS:
        task = Task(
            ngo_id=ngo_id,
            title=title,
            description=desc,
            required_skills=skills,
            priority=priority,
            status="completed" if status == "completed" else "in_progress",
            deadline=now + timedelta(days=days),
            lat=lat,
            lng=lng,
            urgency_score=85 if priority == "high" else 50,
        )
        session.add(task)
        await session.flush()

        assignment = Assignment(
            task_id=task.id, volunteer_id=volunteer_user_id, ngo_id=ngo_id, status=status
        )
        if status == "completed":
            assignment.accepted_at = now - timedelta(days=3)
            assignment.completed_at = now - timedelta(days=2)
        elif status == "accepted":
            assignment.accepted_at = now - timedelta(hours=6)
        session.add(assignment)

    for message, kind in _VOLUNTEER_NOTIFICATIONS:
        session.add(Notification(user_id=volunteer_user_id, message=message, type=kind))
