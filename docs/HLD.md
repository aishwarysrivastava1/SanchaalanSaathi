# High Level Design — Sanchaalan Saathi

**Version:** 3.0 (FastAPI)
**Date:** 2026-09-08
**Supersedes:** the Django 4.2 monolith, since removed from the repo

---

## 1. The one decision that shapes everything else

> **Modular monolith, deployable as microservices. One image, five services,
> selected by an environment variable.**

The brief asked for microservices. Built naively that means five repos, five
pipelines, five deploy targets, five sets of secrets, distributed transactions
across `tasks`/`assignments`/`notifications`, and roughly 5x the hosting bill —
for a platform serving a few hundred concurrent users off a single Postgres
database. That is not scalability, it is overhead wearing scalability's clothes.

So the code is organised along **real service boundaries** — separate modules,
no cross-module imports, each owning its own routes — and `SERVICES` decides how
many processes those modules run in:

```bash
SERVICES=all                  # one process, everything          (start here)
SERVICES=identity             # auth only
SERVICES=coordination,field   # the two portal APIs
SERVICES=realtime             # WebSocket gateway only
```

Splitting a module onto its own Railway service is an **environment-variable
change, not a code change**. You get microservice isolation the day a boundary
actually hurts — the chatbot eating all the workers, WebSockets needing a
different restart cadence — and you pay for it only then.

This is the honest engineering answer, not a dodge. If you specifically want
five separately deployed services from day one, everything is already in place:
create five Railway services from the same repo and set `SERVICES` on each.
Section 7 gives the exact steps.

---

## 2. System context

```
                        +--------------------------+
                        |   Browser (2 portals)    |
                        +------------+-------------+
                                     | HTTPS + WSS
                        +------------v-------------+
                        |  VERCEL - Next.js 15     |
                        |  SSR, edge middleware,   |
                        |  a few server routes     |
                        +------------+-------------+
                                     | HTTPS / WSS  (JWT bearer)
                        +------------v-------------+
                        |  RAILWAY - FastAPI       |
                        |  N replicas, rolling     |
                        +------------+-------------+
              +----------+-----------+-----------+----------+
              v          v           v           v          v
        +---------+ +--------+ +---------+ +--------+ +---------+
        |Postgres | | Redis  | |  Neo4j  | | Gemini | |Firebase |
        |Supabase | |Upstash | |  Aura   | |        | |         |
        +---------+ +--------+ +---------+ +--------+ +---------+
          system      shared     graph +     LLM +      task
          of record   runtime    causality   vision     verification
                      state
```

**Only Postgres is a hard dependency.** Redis missing degrades to single-replica
behaviour. Neo4j, Gemini, Geoapify and Firebase failing each degrade one feature
and nothing else (NFR-8).

---

## 3. Service decomposition

| Service | Mount | Owns | Why it is its own boundary |
|---|---|---|---|
| **identity** | `/api/auth` | users, ngos, volunteer_profiles, consent_events | Different security posture: every route is unauthenticated and rate-limited. Deserves its own blast radius. |
| **coordination** | `/api/ngo` | tasks, assignments, resources, allocations, events, attendance, enrollments, notifications | The admin write path. Heaviest DB use. |
| **field** | `/api/volunteer` | reads across tasks/assignments; writes locations and SOS | Mobile traffic, chattiest endpoints, most bursty. Wants to scale independently. |
| **intelligence** | `/api/chatbot`, `/api/graph`, `/api/analytics`, `/api/ingest`, `/api/sim` | chatbot_*, token counters | Slow, external, expensive. Isolating it stops an LLM stall from starving task assignment. |
| **realtime** | `/api/realtime` | no tables; Redis pub/sub only | Long-lived sockets and rolling restarts mix badly. Restart this on its own cadence. |

**Rule:** modules never import each other. Shared code lives in `app/core`
(config, db, security, deps, errors, events), `app/domain` (business logic) and
`app/integrations` (external systems).

---

## 4. Layering

```
app/
|-- main.py            app factory; mounts modules per SERVICES
|-- models.py          SQLAlchemy models (17 tables)
|-- schemas.py         Pydantic request/response contracts
|-- core/              config . db . security . deps . errors . logging
|                      cache . events . ratelimit . middleware . observability
|-- domain/            matching . locations . chatbot/ . optimization . simulation
|-- integrations/      neo4j . gemini . firebase . geo_routing . cypher . graph_writer
`-- modules/           identity . coordination . field . intelligence . realtime
                       (routers only - HTTP in, HTTP out)
```

Dependencies point **inward**: modules -> domain -> integrations/core. Nothing in
`domain/` imports FastAPI, which is what keeps `app/domain/optimization.py`
testable without a database, a network or an HTTP layer.

---

## 5. Data architecture

### 5.1 Postgres is the system of record

The SQLAlchemy models map **column-for-column onto the schema the original
Django service created**. No renames, no type changes, no data migration.

That was what made the cutover safe: both services could read and write the same
database **at the same time**, traffic shifted at the edge, and rollback was a
URL change rather than a restore. The same discipline now governs ordinary
deploys — see the expand/migrate/contract policy below.

Two schema deviations, both forced by what is already there:
- `Resource.meta` maps to a column literally named `metadata`, reserved by SQLAlchemy.
- Ids are `varchar(36)` holding UUID4 text, not native `uuid`.

**Migration policy (Alembic):**
- `0001_baseline` is intentionally empty — a marker for `alembic stamp`, the
  equivalent of the old `migrate --fake-initial`.
- `0002` adds the unique constraint that makes the token counter atomic.
- Every future migration must be **expand -> migrate -> contract**: add nullable
  columns, backfill, deploy code, only then drop. Never a destructive change in
  the same deploy as the code that needs it, or rollback becomes impossible.

### 5.2 Redis is shared runtime state

Everything that used to be a module-level dict:

| Key | Purpose | TTL |
|---|---|---|
| `realtime:ngo:<id>` | pub/sub channel for WebSocket fan-out | none |
| `loc:volunteer:<id>` | live GPS | `LOCATION_CACHE_TTL_SECONDS` (120s) |
| `rl:<name>:<subject>:<window>` | rate-limit counters | window + 1s |
| `auth:revoked:<jti>` | refresh-token denylist | refresh TTL |
| `chat:history:<session>` | conversation read-through | 300s |
| `distmat:<hash>` | Geoapify distance matrices | 900s |

None of it is a system of record. Losing Redis costs a cache, never a fact.

### 5.3 Neo4j is a derived projection

Needs, locations, skills, causal chains. Writes are best-effort and time-boxed;
a graph outage never fails a Postgres write. It can be rebuilt from Postgres and
Firestore.

---

## 6. Cross-cutting design

**Authentication.** HS256 JWT, same secret and same claims (`sub`, `role`,
`ngo_id`, `email`) as the Django stack, so **existing tokens keep working
through the cutover** — nobody is logged out. Access tokens drop from 24h to
60m and gain a rotating, revocable refresh token. Legacy tokens carry no `type`
claim and are accepted as access tokens; there is a test pinning that behaviour.

**Authorisation.** Four dependencies mirroring the DRF permission classes:
`require_ngo_admin`, `require_ngo_admin_with_ngo`, `require_volunteer_with_ngo`,
`get_current_user`. `ngo_id` always comes from the verified token, never from
request input — that is what makes tenant isolation structural rather than a
code-review promise.

**Errors.** Every failure returns `{"detail", "request_id"}`. Unhandled
exceptions log a stack trace against the correlation id and return a generic
500. `detail` matches the DRF shape, so existing frontend error handling is
unchanged.

**Observability.** One JSON log line per request (method, path, status,
duration, user, ngo, request_id) with emails masked. Prometheus metrics at
`/metrics`, token-gated, labelled by **route template** — never raw paths, or
every task id becomes its own label and cardinality explodes.

**Health.** Two endpoints, and the distinction matters:
- `/health` — liveness, dependency-free, always 200. **This is what Railway checks.**
- `/ready` — readiness, reports DB and Redis state.

Pointing the platform healthcheck at `/ready` means a five-second database blip
kills every container. That is a self-inflicted outage, and a common one.

---

## 7. How zero-downtime actually works

Four things must be true. Three were false before this migration.

1. **Stateless replicas.** Any request may land on any replica. Fixed by 5.2.
2. **Rolling deploys.** Railway starts the new container, waits for `/health`,
   shifts traffic, *then* stops the old one. Old and new run simultaneously —
   which is only safe because of (1).
3. **Graceful shutdown.** `--timeout-graceful-shutdown 30` plus a lifespan hook
   that drains the event bus and disposes pools. Without it, SIGTERM severs
   in-flight requests and every live socket.
4. **Backward-compatible migrations.** Expand -> migrate -> contract (5.1).
   During a rolling deploy both versions run against one schema, so any
   migration the old code cannot tolerate is an outage.

**Cutover from Django.** The Django service has been removed from the repo; its
last commit is `4b30a80` if you need to consult it. Because the schema never
changed, the rollback path is still real: redeploy that commit to a second
Railway service and point `NEXT_PUBLIC_BACKEND_URL` back at it. No data
migration means no data rollback.

```
Phase 1  Deploy FastAPI. Same DB, same JWT secret. Smoke test it directly.
Phase 2  Point NEXT_PUBLIC_BACKEND_URL at it. Watch the error rate.
Phase 3  Keep the old Railway service idle for a week before deleting it.
```

**To split into five deployed services:** create five Railway services from this
same repo and directory, give each an identical environment except `SERVICES`
(`identity`, `coordination`, `field`, `intelligence`, `realtime`), then route by
path prefix at the edge. Only `intelligence` needs the Gemini and Neo4j keys;
only `realtime` needs a long idle timeout.

---

## 8. Failure modes

| Failure | Behaviour | Recovery |
|---|---|---|
| One replica dies | LB routes around it; healthcheck restarts it | Automatic |
| Postgres unavailable | 503 with request id; `/health` still 200 so containers are not killed | Automatic on reconnect |
| Redis unavailable | Degrades to per-process state; **do not run >1 replica in this state** | Automatic; alert on `/ready` |
| Neo4j unavailable | Graph endpoints return empty; task creation unaffected | Automatic |
| Gemini unavailable | Chat retries with backoff, cascades to a fallback model, then refuses cleanly | Automatic |
| Geoapify unavailable | Haversine fallback; assignment quality dips slightly | Automatic |
| Bad deploy | Healthcheck fails, traffic never shifts | Railway keeps the previous release |

---

## 9. Known debt, stated rather than hidden

1. **Firestore/Postgres dual-write.** Task verification writes to Firestore while
   assignments live in Postgres, with no transaction across them. A crash between
   the two leaves them inconsistent. Correct fix: make Postgres authoritative and
   treat Firestore as a projection. Sizeable; deliberately out of scope so far.
2. **CSS cascade shim.** ~80 lines of high-specificity `.dark .bg-white`-style
   overrides instead of design tokens. Works; fragile. 74 `text-white/NN` usages
   across 10 files are propped up by it. Fixing properly means touching every
   call site. The type scale has already been moved out of it into
   `tailwind.config.ts`.
3. **Guest data is never reaped.** Rate-limited now, but a scheduled cleanup is
   still required — see DEPLOYMENT.md.
4. **`mesa` for simulation** is a heavy dependency for a demo feature. Imported
   lazily so its absence cannot break boot.
5. **No integration tests against a real database.** The 47 tests cover routing,
   auth, RBAC, input validation and domain logic, but every one of them runs
   without Postgres. A Postgres-backed suite in CI is the next step, and is the
   largest remaining gap in confidence.
6. **Semantic cache does a linear scan** over 20 rows per query. Fine at this
   size; move to `pgvector` when it is not.

---

## 10. Technology choices

| Choice | Why | Rejected |
|---|---|---|
| FastAPI | Async-native, and this workload is I/O-bound (LLM, Neo4j, HTTP). Typed contracts, OpenAPI for free | Django REST — sync-first, and `sync_to_async` was already papering over that |
| SQLAlchemy 2.0 async | Real async driver, explicit queries | Tortoise, raw asyncpg |
| Alembic | Same lineage as SQLAlchemy; expand/contract friendly | Hand-rolled SQL |
| Redis | One dependency covers pub/sub, rate limits, cache and denylist | Separate broker + cache |
| Pydantic v2 | Validation and serialisation in one declaration | Marshmallow |
| Uvicorn workers | HTTP and WebSocket in one process type | Gunicorn + Daphne split |
| One image, `SERVICES` switch | Microservice boundaries without the microservice tax | Five repos on day one |
