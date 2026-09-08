# Requirement Analysis — Sanchaalan Saathi

**Date:** 2026-09-08
**Method:** derived from the running code, not from a wishlist. Every requirement
below is traceable to an endpoint, a table, or a defect found while reading the
existing system.

---

## 1. What this system actually is

An NGO field-coordination platform with two portals over one backend and one
database.

| Actor | How they get in | What they do |
|---|---|---|
| **NGO admin** | Email/password or Google | Create tasks, manage volunteers, assign work (manually or via the optimiser), track a live map, run analytics, manage events and physical resources |
| **Volunteer** | Invite code from an admin | See skill-matched tasks, accept/complete assignments, request to join open tasks, share GPS, raise SOS |
| **Guest** | One click, no signup | A fully seeded throwaway workspace for demos |
| **Saathi (AI)** | Ambient | Answers questions and triggers platform actions from natural language |

Scale it must survive, honestly stated: a few dozen NGOs, a few hundred
volunteers each, bursty during an incident. This is **not** a high-throughput
system. It is a *correctness- and availability-sensitive* one — during a flood,
a dropped SOS matters far more than p99 latency.

---

## 2. Functional requirements

### FR-1 Identity and access
- **FR-1.1** Email/password and Google sign-in for both roles.
- **FR-1.2** One email maps to exactly one role, enforced on every path (signup, login, Google, invite).
- **FR-1.3** Volunteers cannot self-register; an NGO-issued invite code is required.
- **FR-1.4** An admin without an NGO is routed to setup and blocked from every other admin endpoint.
- **FR-1.5** Sessions must survive a backend swap without logging anyone out.
- **FR-1.6** *(new)* Sessions must be revocable. The old system issued a 24-hour bearer token with no logout and no revocation — a leaked token was valid for a full day.

### FR-2 Task and assignment lifecycle
- **FR-2.1** Task CRUD scoped to the owning NGO, with skills, priority, deadline and geo-coordinates.
- **FR-2.2** Manual assignment of a volunteer to a task.
- **FR-2.3** Bulk optimal assignment across all open tasks (Hungarian algorithm; greedy fallback above ~900 pairs).
- **FR-2.4** Per-task volunteer ranking on demand.
- **FR-2.5** Volunteer accept / reject / complete, with hours logged.
- **FR-2.6** A task closes only when no assignment on it is still active.
- **FR-2.7** Volunteers request to join open tasks; admins approve or reject.
- **FR-2.8** *(new)* An enrollment decision is idempotent — approving twice must not create two assignments and two notifications.

### FR-3 Field operations
- **FR-3.1** Volunteers opt in to GPS sharing; admins see live positions.
- **FR-3.2** Route preview from a volunteer to a task (Geoapify, haversine fallback).
- **FR-3.3** SOS broadcasts location and message to every admin in the NGO, in-app and over WebSocket.
- **FR-3.4** Real-time events for task, assignment, location and SOS changes.

### FR-4 Intelligence
- **FR-4.1** Streaming AI assistant with conversation memory, a semantic response cache, guardrails and a token budget.
- **FR-4.2** Entity extraction from text, documents and images into the knowledge graph.
- **FR-4.3** Natural-language queries over the Neo4j graph.
- **FR-4.4** Causal chains between needs.
- **FR-4.5** Analytics: completion rates, skill gaps, leaderboard, urgency distribution, hot zones.

### FR-5 Resources and events
- **FR-5.1** Resource inventory with allocation to tasks.
- **FR-5.2** Events with attendance tracking.

---

## 3. Non-functional requirements

| ID | Requirement | Why it is stated this way |
|---|---|---|
| **NFR-1 Availability** | Deploys cause no dropped requests or sockets. Target 99.5%. | An outage during an incident is the only outage that matters. |
| **NFR-2 Horizontal scale** | Any number of replicas behind a load balancer, no shared in-process state. | Single-replica is also a *single point of failure*, not just a ceiling. |
| **NFR-3 Latency** | Reads p95 under 400 ms. Bulk assignment under 5 s for 100x100. First chat token under 2 s. | |
| **NFR-4 Tenant isolation** | Every query scoped by `ngo_id` from a verified token. No endpoint returns cross-NGO data. | |
| **NFR-5 Abuse resistance** | Every unauthenticated endpoint rate-limited. | See RISK-3. |
| **NFR-6 Data durability** | No accepted write may be lost to a restart. | See RISK-2. |
| **NFR-7 Observability** | Structured logs with a correlation id; metrics; separate liveness and readiness. | |
| **NFR-8 Graceful degradation** | Neo4j, Gemini, Geoapify or Firebase being down degrades *that feature only*. Postgres is the sole hard dependency. | |
| **NFR-9 Accessibility** | WCAG 2.1 AA. | Field volunteers: one hand, bright sun, small screen. |
| **NFR-10 Reversibility** | Any deploy rolls back in minutes without a data migration. | |

---

## 4. Defects found in the existing system

These are not hypotheticals. Each was found by reading the code, and each is
fixed in this migration.

### RISK-1 — The chatbot has never worked in production
`apps/chatbot/views.py` calls `GuardrailsPipeline.check_input()`,
`HybridMemory(...).get_recent()`, `.add()` and `LLMOrchestrator().stream()`.
**None of those four methods exist** on those classes. Every request raises
`AttributeError` inside the `try`, and the user gets
`"Stream error. Please try again."` The platform's headline AI feature is
100% broken.
→ Fixed: `app/domain/chatbot/pipeline.py` implements the pipeline those call
sites assumed.

### RISK-2 — The system cannot run more than one replica
Five pieces of state live in module-level Python objects:

| Where | What breaks with 2 replicas |
|---|---|
| `CHANNEL_LAYERS = InMemoryChannelLayer` | A volunteer on replica A never receives an SOS published on replica B. Silently. |
| `live_location_cache._buffer` | The map shows only volunteers who happened to hit the same replica. Buffered pings are lost on deploy. |
| `sessionCache._memory_cache` | Two replicas disagree about what was said in a conversation. |
| `chatbot/queue.py` counters | Per-user limits become per-replica, so the real limit is N times higher. |
| `_distance_cache` | Every replica pays full Geoapify cost. |

This is the root cause behind both NFR-1 and NFR-2. You cannot have
zero-downtime deploys with one replica, because zero-downtime *means* running
old and new simultaneously.
→ Fixed: all five moved to Redis.

### RISK-3 — Guest mode is an unauthenticated write amplifier
`POST /api/auth/guest` requires no authentication and writes ~35 rows
(1 user + 1 NGO + 5 volunteers + 5 profiles + 8 tasks + 8 assignments +
4 events + 6 resources + 6 notifications). Nothing rate-limits it and nothing
ever deletes it. A trivial script fills the database.
→ Fixed: 3/hour/IP, plus a documented reaper job.

### RISK-4 — `/api/graph/causal-chain` is a syntax error
`MATCH path=(n {id: $node_id})-[*1..$depth]-()`. Neo4j does not accept a
parameter inside a variable-length bound. The query always throws, the handler
swallows it, and the endpoint returns `{"chain": []}` forever.
→ Fixed: bound validated as an int, then interpolated.

### RISK-5 — Causal edges are silently discarded on ingest
`graph_writer.py` reads `e_type = edge.get("type")` and never uses it, branching
on label pairs instead. Only `LOCATED_IN` and `REQUIRES_SKILL` are ever written;
every `CAUSED_BY` and `AFFECTS` edge Gemini extracts is dropped. The causal
graph — the product's main differentiator — was never built from ingested
reports.
→ Fixed: dispatch on the extracted edge type.

### RISK-6 — Graph endpoints leaked across tenants
`/api/graph/stats`, `/needs`, `/volunteers`, `/tasks` and `/hotspots` were
`AllowAny` and unscoped, returning every NGO's data to anyone who asked.
→ Fixed: authenticated and scoped by `ngo_id`.

### RISK-7 — The daily token budget races
`token_usage_counters` has no uniqueness on `(identifier, date_stamp)`, and the
tracker did read-modify-write. Concurrent requests lose increments.
→ Fixed: unique constraint (migration 0002) plus an atomic upsert.

### RISK-8 — Three endpoints the frontend calls have never existed
`lib/api.ts` calls `/api/sim/compare`; three Next.js routes call
`/api/graph/update-node`. Neither was ever wired into the Django URLconf, so
photo verification never reached the graph.
→ Fixed: both implemented.

### RISK-9 — N+1 queries on the two hottest volunteer screens
The volunteer dashboard and task list ran one `Task.objects.get()` per
assignment inside a Python loop.
→ Fixed: single joins.

### RISK-10 — Accessibility failures
- `userScalable: false` blocks pinch-zoom (WCAG 1.4.4).
- No focus-visible style anywhere, so keyboard users are lost (WCAG 2.4.7).
- Infinite animations with no `prefers-reduced-motion` (WCAG 2.3.3).
- No skip link.
→ Fixed.

### RISK-11 — Unbounded request input
No file-size cap on document ingest; no length caps on several text fields;
`lat`/`lng` unvalidated.
→ Fixed in the Pydantic schemas.

---

## 5. Explicitly out of scope

Named so nobody assumes they were overlooked:

- Payments and donations.
- Native mobile apps. The web app is responsive; it is not offline-capable.
- Multi-region or multi-cloud.
- SSO / SAML.
- Interface i18n. The AI translates *content*; the UI itself is English-only.
- Replacing Firestore with Postgres for task verification. The dual-write
  between them is real architectural debt (see HLD section 9), but unpicking it
  is its own project.
