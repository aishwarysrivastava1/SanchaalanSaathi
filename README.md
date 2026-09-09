<div align="center">

<img src="apps/web/public/logo/logo-full.png" alt="Sanchaalan Saathi" height="160" />

<br/>

# Sanchaalan Saathi

### AI-assisted volunteer & resource coordination for NGOs

<p align="center">
  <a href="#quick-start"><strong>Quick Start</strong></a> &nbsp;·&nbsp;
  <a href="#architecture"><strong>Architecture</strong></a> &nbsp;·&nbsp;
  <a href="#api-reference"><strong>API</strong></a> &nbsp;·&nbsp;
  <a href="#deployment"><strong>Deployment</strong></a> &nbsp;·&nbsp;
  <a href="docs/HLD.md"><strong>Design Doc</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white" />
  <img src="https://img.shields.io/badge/Neo4j-008CC1?style=flat-square&logo=neo4j&logoColor=white" />
  <img src="https://img.shields.io/badge/Gemini_Flash-4285F4?style=flat-square&logo=google&logoColor=white" />
</p>

</div>

---

**Sanchaalan Saathi** *("coordination companion")* is a coordination platform for
NGOs that run field operations with volunteers. An NGO admin posts tasks and
resources; the platform matches volunteers to those tasks by skill, distance,
availability, workload and reliability; volunteers accept work, share live
location, and report completion from the field.

It is a two-service system: a **Next.js 15** frontend and a **FastAPI** backend,
with PostgreSQL as the system of record, Redis as shared cross-replica state,
and Neo4j as a knowledge graph for community-needs analytics.

> **Status.** This is a working, deployable application: 92 backend tests, a
> typechecked and building frontend, CI on every push, and a documented
> zero-downtime deploy path. It is not a hosted product — you deploy your own
> instance.

---

## Table of contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Tech stack](#tech-stack)
- [How the interesting parts work](#how-the-interesting-parts-work)
  - [Assignment optimisation](#assignment-optimisation)
  - [The chatbot](#the-chatbot)
  - [The knowledge graph](#the-knowledge-graph)
  - [Realtime](#realtime)
  - [Auth and multi-tenancy](#auth-and-multi-tenancy)
- [Data model](#data-model)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Deployment](#deployment)
- [Zero-downtime and migrations](#zero-downtime-and-migrations)
- [Testing and CI](#testing-and-ci)
- [Further documentation](#further-documentation)

---

## What it does

### NGO admin portal (`/ngo/*`)

| Screen | What it is for |
|---|---|
| **Dashboard** | Live counts of volunteers, open tasks, assignments and alerts |
| **Tasks** | Create, edit, delete tasks; assign manually or run AI matching; ping and complete |
| **Volunteers** | Roster, individual profiles, deactivation, enrolment approvals |
| **Map** | Live positions of volunteers who opted into location sharing |
| **Resources** | Inventory with allocation against tasks |
| **Events** | Scheduling plus per-volunteer attendance marking |
| **Analytics** | Nine endpoints — overview, skill gaps, leaderboard, urgency distribution, skill coverage, hot-zone ranking, volunteer activity, needs by type, activity trend — each with a chart/table toggle |
| **Reports** | Free-text, document and voice ingest into the knowledge graph |
| **Notifications** | Activity feed with mark-one and mark-all |
| **Setup / Profile** | NGO creation, invite codes, org profile |

### Volunteer portal (`/vol/*`)

| Screen | What it is for |
|---|---|
| **Dashboard** | Assigned work, today's schedule, quick actions |
| **Tasks / All tasks** | Accept, reject or complete assignments; browse and enrol in open tasks |
| **Analytics** | Personal contribution stats |
| **Profile** | Skills, availability, location-sharing consent |
| **Notifications** | Assignment and status updates |
| **SOS** | Panic signal that raises an alert on the admin side |

### Cross-cutting

- **Guest mode** — one click into either portal with seeded demo data, no signup.
- **Chatbot** — a layered assistant available to both roles (details below).
- **Realtime** — WebSocket fan-out for assignments, locations and alerts.
- **Dark mode** — every screen, with validated colour-blind-safe chart palettes.

---

## Architecture

```
                        ┌────────────────────────────┐
   Browser ────────────▶│  Next.js 15 (Vercel)       │
                        │  App Router · middleware   │
                        │  route guard · /api/* proxy│
                        └────────────┬───────────────┘
                                     │  same-origin (rewrites)
                                     ▼
                        ┌────────────────────────────┐
                        │  FastAPI (Railway)         │
                        │  modular monolith          │
                        │                            │
                        │  identity · coordination   │
                        │  field · intelligence      │
                        │  realtime                  │
                        └──┬────────┬────────┬───────┘
                           │        │        │
              ┌────────────┘        │        └──────────────┐
              ▼                     ▼                       ▼
      ┌───────────────┐    ┌────────────────┐      ┌────────────────┐
      │  PostgreSQL   │    │     Redis      │      │    Neo4j       │
      │  system of    │    │  pub/sub ·     │      │  knowledge     │
      │  record       │    │  rate limits · │      │  graph         │
      │  (Supabase)   │    │  live location │      │  (Aura)        │
      └───────────────┘    └────────────────┘      └────────────────┘

      External: Google Gemini · Firebase Auth · Geoapify · Twilio
```

### The modular monolith

The backend ships as **one codebase that deploys as one process or as five**.
Every route lives in a module under `app/modules/`, and `app/main.py` mounts
only the modules named by the `SERVICES` environment variable:

```bash
SERVICES=all                    # everything in one process — start here
SERVICES=identity               # only /api/auth
SERVICES=coordination,field     # only the NGO + volunteer APIs
SERVICES=realtime               # only the WebSocket gateway
```

Routers are imported lazily inside the module-selection generator, so a process
running `SERVICES=identity` never imports Neo4j, Gemini or the optimiser.
Splitting a service out is an environment-variable change plus a second Railway
service — not a code change, not a rewrite.

**Why this shape.** A true microservice-per-domain split costs you distributed
transactions, N deployment pipelines and a service mesh, in exchange for
independent scaling you do not need at this size. This keeps the seam — clean
module boundaries, no cross-module imports — while deferring the operational
cost until traffic actually justifies it.

### Why Redis is not optional in production

Three pieces of state are shared across replicas: realtime pub/sub fan-out,
rate-limit windows, and live volunteer locations. Without Redis all three fall
back to per-process memory. That works on one replica and **silently breaks on
two** — a WebSocket client connected to replica A never sees an event published
on replica B, and rate limits become per-process. Since more than one replica is
what makes rolling deploys zero-downtime, Redis is what makes zero-downtime
possible.

---

## Repository layout

```
.
├── apps/web/                     Next.js 15 frontend
│   ├── app/                      App Router pages (21 routes)
│   │   ├── ngo/                  admin portal
│   │   ├── vol/                  volunteer portal
│   │   ├── register/             NGO + volunteer signup
│   │   └── api/health/           health proxy to the backend
│   ├── components/
│   │   ├── ui/primitives.tsx     Card, Badge, Button, DataTable, Modal, states
│   │   ├── ui/chart-tokens.ts    validated light/dark chart palettes
│   │   ├── ui/BottomNav.tsx      mobile nav: 4 slots + "More" sheet
│   │   ├── map/                  Google Maps controller + markers
│   │   └── NotificationsView.tsx shared by both portals
│   ├── hooks/                    useApi, useRealtimeSocket, useToast
│   ├── lib/
│   │   ├── ngo-api.ts            single typed API client
│   │   ├── token-manager.ts      access/refresh tokens, single-flight refresh
│   │   ├── ngo-auth.tsx          auth context
│   │   ├── guest-mode.ts         client-side demo mode
│   │   ├── motion.ts             the motion scale (durations, springs, lifts)
│   │   └── env.ts                fails the deploy on missing config
│   ├── middleware.ts             route guard + security headers
│   └── next.config.js            rewrites, CSP, redirects
│
├── services/api/                 FastAPI backend
│   ├── app/
│   │   ├── main.py               app factory, module selection, lifespan
│   │   ├── models.py             SQLAlchemy models (18 tables)
│   │   ├── schemas.py            Pydantic request/response models
│   │   ├── core/                 config, db, deps, security, ratelimit,
│   │   │                         cache, events, errors, middleware,
│   │   │                         logging, observability
│   │   ├── domain/               business logic, no HTTP
│   │   │   ├── optimization.py   scoring, Hungarian + greedy, cost matrix
│   │   │   ├── matching.py       task ↔ volunteer matching
│   │   │   ├── locations.py      live location read/write
│   │   │   ├── simulation.py     agent-based scenario runner
│   │   │   └── chatbot/          guardrails, intents, responders,
│   │   │                         prompts, pipeline
│   │   ├── modules/              HTTP layer, one package per service
│   │   │   ├── identity/         /api/auth
│   │   │   ├── coordination/     /api/ngo
│   │   │   ├── field/            /api/volunteer
│   │   │   ├── intelligence/     /api/chatbot, /graph, /analytics,
│   │   │   │                     /ingest, /voice, /sim
│   │   │   └── realtime/         /api/realtime
│   │   └── integrations/         neo4j, gemini, firebase, cypher,
│   │                             geo_routing, graph_writer
│   ├── alembic/                  migrations
│   ├── tests/                    92 tests
│   ├── Dockerfile
│   └── railway.toml              pre-deploy migration + healthcheck
│
├── design-system/
│   └── sanchaalan-saathi/
│       └── MASTER.md             tokens, component specs, a11y contract
│
├── docs/
│   ├── HLD.md                    high-level design
│   ├── REQUIREMENTS.md           requirement analysis
│   ├── DEPLOYMENT.md             step-by-step deploy guide
│   └── sql/reap-guest-data.sql   scheduled cleanup of demo data
│
├── .github/workflows/ci.yml      lint, tests, typecheck, build, image
└── docker-compose.yml            Postgres + Redis + API, locally
```

---

## Tech stack

### Frontend

| | |
|---|---|
| Framework | Next.js 15 (App Router), React 18.3, TypeScript 5 |
| Styling | Tailwind CSS 3.4, dark mode via the `class` strategy |
| Charts | Recharts 2.13 with hand-validated palettes |
| Motion | `motion/react` (Framer Motion 12) |
| Icons | lucide-react |
| Maps | Google Maps JS API via `@googlemaps/js-api-loader` |
| Auth (client) | Firebase Auth — Google sign-in only |

### Backend

| | |
|---|---|
| Framework | FastAPI 0.115, Uvicorn 0.34, Python 3.12 |
| ORM | SQLAlchemy 2.0 async + asyncpg |
| Migrations | Alembic 1.14 |
| Validation | Pydantic v2 + pydantic-settings |
| Auth | PyJWT (HS256) + bcrypt |
| Cache / bus | redis-py 5.2 |
| Graph | neo4j 5.27 async driver |
| AI | google-generativeai (Gemini Flash) |
| Optimisation | NumPy 2.2 + SciPy 1.14 (`linear_sum_assignment`) |
| Simulation | Mesa 2.4 |
| Metrics | prometheus-client |
| Voice / SMS | Twilio |
| Lint / test | ruff 0.8, pytest 8.3 |

### Infrastructure

| | |
|---|---|
| Frontend host | Vercel |
| Backend host | Railway (Docker) |
| Database | Supabase Postgres (or any Postgres 16) |
| Cache | Upstash Redis (or any Redis 7) |
| Graph | Neo4j AuraDB |
| CI | GitHub Actions |

---

## How the interesting parts work

### Assignment optimisation

`app/domain/optimization.py` is pure: snapshots in, matches out. The only I/O is
an injected route service, so the whole thing is testable without a database or
a network.

**Scoring.** Each volunteer–task pair gets a weighted utility score:

| Factor | Weight | Notes |
|---|---|---|
| Distance | 0.35 | Linear decay to a 50 km ceiling |
| Skill match | 0.25 | Fraction of required skills held |
| Availability | 0.10 | Days marked available / 7 |
| Urgency | 0.10 | Task urgency score, or priority as fallback |
| Workload | 0.10 | Decays to zero at 5 concurrent tasks |
| Reliability | 0.10 | Historical performance score |

A volunteer holding **none** of the required skills is infeasible regardless of
every other factor, and gets a sentinel cost rather than a merely low score.

**Solving.** Cost matrix → `scipy.optimize.linear_sum_assignment` (Hungarian,
globally optimal) when `volunteers × tasks ≤ 900`; a greedy cheapest-pair-first
solver above that, where the cubic term stops being worth it.

**Distance.** Rows are sorted by geography first, so a batched lookup covers one
compact area instead of criss-crossing the map. Matrices larger than the
provider's per-call cap are tiled. Results cache in Redis for 15 minutes under a
key derived from coordinates only and order-insensitive, so the same geography
reuses one lookup however the rows happen to be arranged. Without Geoapify
configured it falls back to haversine.

### The chatbot

Four layers, cheapest first. Most turns never reach the model.

```
L1  Guardrails       input verification, injection and abuse screening
L2  Intent parser    in-house, deterministic — answers from the database
L3  Semantic cache   embedding similarity ≥ 0.85 against past answers
L4  Model            Gemini 2.0 Flash, streamed over SSE
```

**L2 is the interesting one.** Rather than sending "how many open tasks do I
have" to an LLM, `domain/chatbot/intents.py` is a purpose-built parser: a
normaliser, a synonym table, a canonical vocabulary gate for stem matching, and
rules with `any_of` / `phrases` / `blocked_by` conditions. Above a 0.72
confidence threshold, `responders.py` answers directly from a single aggregate
SQL query. That path costs one database round-trip, returns in milliseconds, and
cannot hallucinate a number.

**Guardrails that matter at L4.** The model may *propose* an action, but the
action is matched against an allowlist (`ALLOWED_CALLS`, `CONFIRM_CALLS`) before
anything executes — the model never selects a method to dispatch. Replies are
sanitised, action blocks are stripped from user-visible text, and per-user plus
global token budgets are enforced *before* the call is paid for.

**Streaming.** Responses stream as SSE. The pipeline opens its **own** database
session rather than using the request-scoped one, because a `StreamingResponse`
outlives its request dependencies.

### The knowledge graph

Free text, documents and voice recordings are ingested through `/api/ingest/*`,
extracted by Gemini into needs, locations, causal edges and skills, and written
to Neo4j with the NGO's id on every node — the graph is multi-tenant like
everything else. The graph then feeds hot-zone ranking, causal-chain queries,
skill coverage and needs-by-type analytics.

Volunteer skills are mirrored as `HAS_SKILL` edges, and completions bump
`totalTasksCompleted` / `totalXP` / `reputationScore` — which is what makes the
skill-coverage and volunteer-activity analytics report real numbers rather than
zeroes.

`/api/graph/ask` accepts a natural-language question and generates Cypher for it,
scoped to the caller's NGO against an allowlisted schema.

### Realtime

`/api/realtime/ws` is a WebSocket gateway. Events are published to a Redis
pub/sub channel by whichever replica handled the write, and every replica
fans out to its own connected clients. Assignment changes, location updates and
SOS alerts all travel this path. `useRealtimeSocket.ts` reconnects with backoff
on the client.

The WebSocket connects **directly** to the backend, not through the Vercel
rewrite — Vercel does not proxy WebSocket upgrades. That is why
`NEXT_PUBLIC_BACKEND_URL` is needed at runtime as well as at build time.

### Auth and multi-tenancy

- **Access tokens** — JWT HS256, 60-minute TTL.
- **Refresh tokens** — 30-day, rotating on every use, revocable through a Redis
  denylist keyed by `jti`.
- **Client refresh** — `token-manager.ts` refreshes two minutes before expiry and
  is single-flight: ten parallel requests hitting a stale token fire **one**
  refresh, not ten racing rotations.
- **Route guard** — `middleware.ts` reads the token from a cookie and enforces
  role separation before a protected page renders: `/ngo/*` requires
  `ngo_admin`, `/vol/*` requires `volunteer`.
- **Tenancy** — every query is scoped by `ngo_id` from the token. That includes
  the graph and analytics endpoints, not just the CRUD ones.
- **Rate limits** — per-IP and per-user windows in Redis on auth, guest signup
  and chatbot routes. Guest signup writes ~35 rows per call and needs no login,
  so it is limited hardest.
- **Security headers** — CSP, HSTS, `X-Frame-Options`, `Permissions-Policy` and
  COOP/CORP are set in both `next.config.js` and `middleware.ts`.

---

## Data model

18 tables in PostgreSQL:

| Group | Tables |
|---|---|
| Tenancy & identity | `ngos`, `users`, `volunteer_profiles`, `consent_events` |
| Work | `tasks`, `assignments`, `task_enrollment_requests` |
| Resources | `resources`, `allocations` |
| Events | `events`, `event_attendance` |
| Comms | `notifications` |
| Chatbot | `chatbot_sessions`, `chatbot_messages`, `chatbot_semantic_cache` |
| Budgets | `token_usage_counters`, `global_resource_counters` |
| Demo | `guests` |

Neo4j holds `Need`, `Location`, `Volunteer`, `Skill` and `Task` nodes with
uniqueness constraints and a point index on locations.

---

## Quick start

### Prerequisites

- **Node.js 20+** and **Python 3.12**
- **Docker** (optional, but the fastest path)
- API keys are optional for a first run — endpoints needing a missing key return
  a clear error instead of crashing.

### 1. Clone

```bash
git clone <your-repo-url>
cd SanchaalanSaathi
```

### 2. Everything at once (recommended)

```bash
docker compose up
```

That starts Postgres, Redis and the API together. The API is on
<http://localhost:8000>, with interactive docs at <http://localhost:8000/docs>.

Then, in a second terminal:

```bash
cd apps/web
cp .env.example .env.local     # set NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
npm install
npm run dev                    # http://localhost:3000
```

### 3. Or run the backend directly

```bash
cd services/api
python -m venv .venv
.venv/Scripts/activate          # Windows
# source .venv/bin/activate     # macOS / Linux

pip install -r requirements-dev.txt
cp .env.example .env            # set JWT_SECRET_KEY and DB settings at minimum
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### 4. Verify

```bash
# Backend
cd services/api
ruff check .
pytest -q                       # 92 passed

# Frontend
cd apps/web
npx tsc --noEmit
npm run build
```

### 5. Try it without signing up

Open <http://localhost:3000> and use **guest mode** on either portal. It seeds
demo data and drops you straight into the dashboard.

---

## Environment variables

Full annotated templates live in `services/api/.env.example` and
`apps/web/.env.example`. The essentials:

### Frontend — `apps/web/.env.local`

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | **yes** | Backend origin. Needed at **build time** (rewrites) *and* at runtime (WebSocket). |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | yes | Google sign-in |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | yes | Google sign-in |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | yes | Google sign-in |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | no | Without it, only the map is blank |
| `ENFORCE_ENV_VALIDATION` | no | Set to `1` to run the production env check locally |

All `NEXT_PUBLIC_*` values are baked in at build time. Changing one in Vercel
requires a redeploy, not just a restart.

### Backend — `services/api/.env`

| Variable | Required | Purpose |
|---|---|---|
| `JWT_SECRET_KEY` | **yes** | ≥ 32 chars. Changing it signs out every user. |
| `DATABASE_URL` *(or the `DB_*` parts)* | **yes** | Postgres. Use the **pooler** (6543) here. |
| `FRONTEND_URL` | **yes** | Without it, CORS blocks every browser call |
| `REDIS_URL` | prod | See [why](#why-redis-is-not-optional-in-production) |
| `SERVICES` | no | `all` by default |
| `WEB_CONCURRENCY` | no | Uvicorn workers; `2` suits a 512 MB container |
| `GEMINI_API_KEY` | no | Chatbot L4, ingest extraction |
| `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` | no | Graph + graph analytics |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | no | Activity feed / trend analytics |
| `GEOAPIFY_API_KEY` | no | Real routing; falls back to haversine |
| `METRICS_TOKEN` | prod | Guards `GET /metrics` |
| `USER_DAILY_TOKEN_LIMIT`, `GLOBAL_TPM_LIMIT` | no | AI spend ceilings |
| `GUEST_SIGNUPS_PER_HOUR_PER_IP` | no | Abuse control on the free demo path |

`validate_for_boot()` refuses to start a **production** process with a default
secret, a missing database or a missing frontend URL. It is deliberately loud —
a backend that boots misconfigured fails later, in public.

---

## API reference

95 routes. Interactive docs at `/docs` on a running instance.

### Identity — `/api/auth`

```
POST   /signup                     POST   /guest
POST   /login                      POST   /guest-volunteer
POST   /google                     POST   /ngo/create
POST   /refresh                    GET    /check-email
POST   /logout                     GET    /ngo/lookup/{invite_code}
GET    /me
```

### NGO admin — `/api/ngo`

```
GET    /dashboard                  GET    /resources
GET    /analytics                  POST   /resources
GET    /alerts                     PUT    /resources/{id}
                                   DELETE /resources/{id}
GET    /volunteers                 POST   /resources/{id}/allocate
GET    /volunteers/{id}
GET    /volunteers/{id}/profile    GET    /events
DELETE /volunteers/{id}            POST   /events
POST   /volunteers/{id}/deactivate DELETE /events/{id}
GET    /volunteer-locations        GET    /events/{id}/attendance
                                   POST   /events/{id}/attendance/{vol_id}
GET    /tasks
POST   /tasks                      GET    /enrollment-requests
GET    /tasks/{id}                 POST   /enrollment-requests/{id}/approve
PUT    /tasks/{id}                 POST   /enrollment-requests/{id}/reject
DELETE /tasks/{id}
POST   /tasks/{id}/assign          GET    /notifications
POST   /tasks/{id}/ai-match        POST   /notifications/read-all
POST   /tasks/{id}/ping            POST   /notifications/{id}/read
POST   /tasks/{id}/complete
POST   /assign-tasks               GET    /assignments
POST   /routes/preview
```

### Volunteer — `/api/volunteer`

```
GET    /dashboard                  GET    /profile
GET    /tasks                      PUT    /profile
GET    /open-tasks                 POST   /location
GET    /recommendations            DELETE /location
                                   POST   /sos
GET    /assignments
POST   /assignments/{id}/accept    GET    /notifications
POST   /assignments/{id}/reject    PATCH  /notifications
POST   /assignments/{id}/complete  POST   /notifications/{id}/read
POST   /tasks/{id}/enroll
GET    /enrollment-requests
```

### Intelligence

```
POST   /api/chatbot                streamed SSE

GET    /api/graph/stats            GET    /api/analytics/ngo-overview
GET    /api/graph/needs            GET    /api/analytics/skill-gaps
GET    /api/graph/volunteers       GET    /api/analytics/leaderboard
GET    /api/graph/tasks            GET    /api/analytics/urgency-distribution
GET    /api/graph/hotspots         GET    /api/analytics/skill-coverage
GET    /api/graph/causal-chain     GET    /api/analytics/hotzone-ranking
POST   /api/graph/ask              GET    /api/analytics/volunteer-activity
POST   /api/graph/seed             GET    /api/analytics/needs-by-type
                                   GET    /api/analytics/trend
POST   /api/ingest/text            GET    /api/analytics/coverage-history
POST   /api/ingest/document
POST   /api/ingest/voice           POST   /api/sim/run
POST   /api/voice/twiml            GET    /api/sim/compare
POST   /api/voice/recording
```

### Realtime and operations

```
WS     /api/realtime/ws
GET    /api/realtime/status
GET    /health          liveness  — the process is up
GET    /ready           readiness — dependencies reachable
GET    /metrics         Prometheus, guarded by METRICS_TOKEN
```

`/health` and `/ready` are deliberately different. Liveness must not fail
because Postgres blipped, or the orchestrator restarts a healthy process during
a database hiccup and turns a small outage into a large one.

---

## Deployment

Full walkthrough, written for a first-time deployer:
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

### What you need to sign up for

| Service | Tier | What breaks without it |
|---|---|---|
| **Supabase** (or any Postgres) | Free | Everything |
| **Railway** | Hobby | Backend has nowhere to run |
| **Vercel** | Hobby | Frontend has nowhere to run |
| **Upstash Redis** | Free | Realtime and rate limits break on >1 replica |
| **Google AI Studio** | Free | Chatbot L4 and ingest extraction |
| **Neo4j AuraDB** | Free | Graph endpoints and graph analytics |
| **Firebase** | Free | Google sign-in |
| **Geoapify** | Free | Falls back to straight-line distance |
| **Twilio** | Paid | Voice-call ingest |

### Backend → Railway

1. New project → deploy from your repo → set the root directory to `services/api`.
2. `railway.toml` already selects the Dockerfile, sets `/health` as the
   healthcheck, and runs `alembic upgrade head` as a **pre-deploy** command.
3. Set the environment variables from the table above.
4. **Point the migration connection at port 5432, not 6543.** pgBouncer in
   transaction mode cannot run DDL reliably; the app uses the pooler, migrations
   use the direct connection.

### Frontend → Vercel

1. Import the repo → set the root directory to `apps/web`.
2. Add the `NEXT_PUBLIC_*` variables **before** the first build.
3. Deploy, then set `FRONTEND_URL` on Railway to the resulting Vercel URL and
   redeploy the backend so CORS admits it.

### Supabase notes

Supabase hands you two connection strings and both matter:

- **Port 6543** — transaction pooler → `DATABASE_URL` for the app.
- **Port 5432** — direct → migrations.

`statement_cache_size=0` is set for asyncpg, because pgBouncer in transaction
mode does not support prepared statements.

---

## Zero-downtime and migrations

Zero-downtime here is not one switch; it is four things holding together:

1. **More than one replica**, which requires Redis for shared state.
2. **Readiness gating** — Railway starts the new container, waits for the
   healthcheck, shifts traffic, and only then stops the old one.
3. **A graceful shutdown window**, so in-flight requests finish.
4. **Backwards-compatible migrations.**

### Expand → migrate → contract

Old and new code run **simultaneously** during every rolling deploy, so a
migration must never break the version it is replacing:

| Phase | Deploy | Rule |
|---|---|---|
| **Expand** | 1 | Add nullable columns / new tables. Never rename, never drop. |
| **Migrate** | 2 | Backfill; write both shapes; read the new one. |
| **Contract** | 3 | Only once no running code touches the old shape: drop it. |

A rename is an expand-migrate-contract sequence, never an `ALTER ... RENAME`.

CI enforces a **single migration head**, catching the classic failure where two
branches each add a migration on the same parent and `alembic upgrade head`
becomes ambiguous.

---

## Testing and CI

```bash
cd services/api && ruff check . && pytest -q     # 92 tests
cd apps/web && npx tsc --noEmit && npm run build
```

`.github/workflows/ci.yml` runs three jobs on every push and pull request:

| Job | Steps |
|---|---|
| **API** | ruff → pytest → assert exactly one Alembic head |
| **Web** | `npm ci` → `tsc --noEmit` → `next build` |
| **Docker** | Build the API image with GitHub Actions layer caching |

A newer push cancels an in-flight run on the same branch.

---

## Further documentation

| Document | Contents |
|---|---|
| **[docs/HLD.md](docs/HLD.md)** | High-level design: component breakdown, data flow, scaling model, trade-offs |
| **[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)** | The requirement analysis the design answers to |
| **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** | Step-by-step deployment with troubleshooting |
| **[docs/sql/reap-guest-data.sql](docs/sql/reap-guest-data.sql)** | Scheduled cleanup for demo/guest rows |
| **[design-system/sanchaalan-saathi/MASTER.md](design-system/sanchaalan-saathi/MASTER.md)** | Design tokens, component specs, motion scale, accessibility contract |

---

<div align="center">

Built for NGOs who currently coordinate field operations over WhatsApp.

</div>
