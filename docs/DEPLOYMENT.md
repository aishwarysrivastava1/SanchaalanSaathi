# Deployment Guide — for someone who has never deployed anything

**Read this top to bottom once before doing anything.** Every step says what
you are doing and why, so when something breaks you know where to look.

Rough time: **2-3 hours** the first time.
Rough cost: **$0/month** to start (all free tiers), ~$10-25/month once real
traffic arrives. Exact numbers in section 12.

---

## 0. The mental model

Five moving pieces. Understand this and the rest is form-filling.

| Piece | What it is | Who hosts it | Free? |
|---|---|---|---|
| **Frontend** | The website people see | Vercel | Yes |
| **Backend API** | The program that holds the rules and talks to the database | Railway | ~$5/mo after trial |
| **Postgres** | The permanent record: users, tasks, assignments | Supabase | Yes |
| **Redis** | Short-lived shared memory between backend copies | Upstash | Yes |
| **Neo4j / Gemini / Firebase** | Graph, AI, photo verification | Aura / Google / Firebase | Yes |

The backend is the only piece that talks to the database. The frontend only
talks to the backend. **Nothing except the backend should ever hold a database
password.**

### What an "environment variable" is

A setting you give a program from outside, instead of writing it in the code.
Passwords and API keys live here, because code goes into git and git is
forever. You will spend most of this guide copying values into environment
variable boxes on various websites.

**Rule you must not break:** never commit a real key to git. `.env` is already
in `.gitignore`. Only `.env.example` — which has blanks, not secrets — is
committed.

---

## 1. Accounts to create

All free, all sign-in-with-GitHub:

1. **GitHub** — https://github.com (you have this)
2. **Supabase** — https://supabase.com — the database
3. **Upstash** — https://upstash.com — Redis
4. **Railway** — https://railway.app — runs the backend
5. **Vercel** — https://vercel.com — runs the frontend
6. **Google AI Studio** — https://aistudio.google.com — Gemini key
7. **Neo4j Aura** — https://neo4j.com/cloud/aura — graph database
8. **Firebase** — https://console.firebase.google.com — Google sign-in

If you already deployed the Django version, you have 1, 2, 4, 5, 6, 7, 8
already. **Reuse them.** Only Upstash (Redis) is new — and it is the single
most important addition, because it is what lets you run more than one copy of
the backend at once. Without it there is no zero-downtime.

---

## 2. Generate your secrets first

Do this before touching any website, and paste the results into a scratch file.

**JWT secret** — signs login tokens. Run in a terminal:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

> **If you are migrating from the existing Django deployment, do NOT generate a
> new one.** Copy the `JWT_SECRET_KEY` already set on your Django Railway
> service. Same secret means every currently signed-in user stays signed in
> when you switch over. A new secret logs everyone out instantly.

**Internal service secret** — lets your Vercel server routes call the backend:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Metrics token** — protects `/metrics` from the public:

```bash
python -c "import secrets; print(secrets.token_urlsafe(24))"
```

Keep these three in a password manager. If one leaks, rotate it.

---

## 3. Database (Supabase)

**Already have one from the Django deploy? Skip to 3.2 — do not create a new
project.** The new backend uses the exact same tables.

### 3.1 New project

1. https://supabase.com/dashboard -> **New project**
2. Name `sanchaalan-saathi`, pick a strong database password, choose the region
   closest to your users (`ap-south-1` for India).
3. Wait ~2 minutes.

### 3.2 Get the two connection strings — you need both

**Project Settings -> Database -> Connection string -> URI**

Supabase gives you two, and using the wrong one is the most common cause of
mysterious failures:

| Port | Called | Use it for | Why |
|---|---|---|---|
| **6543** | Transaction pooler | The **running app** (`DATABASE_URL`) | Handles many short connections. Free tier allows very few direct ones. |
| **5432** | Direct | **Migrations only** (`MIGRATION_DATABASE_URL`) | The pooler cannot run schema changes reliably. |

Copy both. Replace `[YOUR-PASSWORD]` with your actual database password.

> The code already sets `statement_cache_size=0` for you. Without it the pooler
> throws `InvalidSQLStatementNameError` under load — a genuinely confusing bug.

### 3.3 Take a backup before you migrate

**Database -> Backups.** Note that a restore point exists. Migration `0002`
deletes duplicate rows in `token_usage_counters` (it sums their values into the
surviving row first, so no usage is lost). Low risk, but take the snapshot.

---

## 4. Redis (Upstash) — the new one, and the important one

Redis is short-lived shared memory that every copy of your backend can see.

**Why it is not optional in production:** the old Django backend kept live GPS
positions, WebSocket connections, chat history and rate-limit counters in the
memory of a single process. Run two copies and they each see half the truth —
a volunteer connected to copy A never receives an SOS sent from copy B, and
nothing errors. Running one copy avoids that, but one copy means every deploy
is an outage.

Redis is what makes "more than one copy" correct, and more than one copy is
what makes zero-downtime possible.

1. https://console.upstash.com -> **Create Database**
2. Name `sanchaalan-redis`, type **Regional**, same region as Supabase.
3. Open it, scroll to **REST / Redis connect**, copy the **`rediss://` URL**
   (two s's — that is the TLS one).

Free tier: 10,000 commands/day. Plenty to start.

> The app refuses to boot in production without `REDIS_URL`. That is
> deliberate. It is the difference between "scales" and "quietly loses SOS
> alerts".

---

## 5. AI, graph and Firebase keys

Reuse everything here if you already deployed the Django version.

**Gemini** — https://aistudio.google.com/apikey -> Create API key. Free tier is
generous. Set both `GEMINI_API_KEY` and `GEM_KEY` to the same value; the code
accepts either.

**Neo4j Aura** — https://console.neo4j.io -> New Instance -> **AuraDB Free**.
It shows the password **once**. Save it now. You need `NEO4J_URI`
(`neo4j+s://...`), `NEO4J_USER` (`neo4j`), `NEO4J_PASSWORD`.

**Firebase** — Project settings -> Service accounts -> **Generate new private
key**. Downloads a JSON file. You must flatten it to one line:

```bash
python -c "import json;print(json.dumps(json.load(open('service-account.json'))))"
```

Paste that single line as `FIREBASE_SERVICE_ACCOUNT_JSON`. **Delete the
downloaded file afterwards** — it is a full credential to your Firebase project.

**Geoapify** (optional) — https://myprojects.geoapify.com for real driving
routes. Without it the app uses straight-line distance, which is fine.

---

## 6. Deploy the backend (Railway)

### 6.1 Create the service

1. https://railway.app -> **New Project** -> **Deploy from GitHub repo**
2. Pick your repo.
3. **Settings -> Service -> Root Directory: `services/api`**
   This is the single most-missed step. Without it Railway builds the wrong
   folder and everything fails confusingly.
4. Railway detects the `Dockerfile` automatically.

### 6.2 Environment variables

**Variables -> Raw Editor**, paste, then fill in your values:

```env
DEPLOYMENT_ENV=production
SERVICES=all
WEB_CONCURRENCY=2
LOG_LEVEL=INFO

JWT_SECRET_KEY=<from step 2 - or your existing Django one>
ACCESS_TOKEN_TTL_MINUTES=60
REFRESH_TOKEN_TTL_DAYS=30

FRONTEND_URL=https://your-app.vercel.app

DATABASE_URL=<Supabase port 6543 pooler URL>
MIGRATION_DATABASE_URL=<Supabase port 5432 direct URL>
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=5

REDIS_URL=<Upstash rediss:// URL>

GEMINI_API_KEY=<your key>
GEM_KEY=<same key>

NEO4J_URI=neo4j+s://xxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=<your password>

FIREBASE_SERVICE_ACCOUNT_JSON=<the one-line JSON>

INTERNAL_SERVICE_SECRET=<from step 2>
METRICS_TOKEN=<from step 2>

ENABLE_GUEST_MODE=true
GUEST_SIGNUPS_PER_HOUR_PER_IP=3
AUTH_ATTEMPTS_PER_MINUTE_PER_IP=10
CHATBOT_REQUESTS_PER_MINUTE_PER_USER=12
```

The app **refuses to start** if `JWT_SECRET_KEY` is the default, shorter than
32 characters, or if `REDIS_URL` is missing in production. It fails loudly at
boot with a list of problems, rather than serving broken traffic. Read the
deploy log if it will not start.

### 6.3 Baseline the database — do this ONCE, before the first deploy

Your tables already exist (Django made them). You must tell the migration tool
"we are already at the starting point", or it will try to create tables that
are already there and fail.

Railway shell (**Settings -> Deploy -> Run command**), or locally with
`MIGRATION_DATABASE_URL` exported:

```bash
alembic stamp 0001_baseline
```

This writes a marker row and changes no tables. It is the direct equivalent of
the `migrate --fake-initial` in the old README.

**Only after that**, apply the real migration:

```bash
alembic upgrade head
```

From then on Railway runs `alembic upgrade head` automatically before each
deploy (`preDeployCommand` in `railway.toml`).

> Migrations must use the **direct** URL (port 5432). If `alembic` hangs or
> errors oddly, you are pointed at the pooler.

### 6.4 Get your URL

**Settings -> Networking -> Generate Domain.** You get
`https://something.up.railway.app`. Test it:

```bash
curl https://something.up.railway.app/health
```

Expect `{"status":"healthy",...}`. Then:

```bash
curl https://something.up.railway.app/ready
```

Expect `"database":"ok"` and `"redis":"ok"`. If redis says `degraded`, your
`REDIS_URL` is wrong — fix it before going further.

---

## 7. Deploy the frontend (Vercel)

1. https://vercel.com/new -> import the repo.
2. **Root Directory: `apps/web`** (same trap as Railway).
3. Framework preset: Next.js (auto-detected).
4. Environment variables:

```env
NEXT_PUBLIC_BACKEND_URL=https://something.up.railway.app

NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

FIREBASE_SERVICE_ACCOUNT_JSON=<same one-line JSON>
GEM_KEY=<same Gemini key>
INTERNAL_SERVICE_SECRET=<must MATCH Railway exactly>
```

> `NEXT_PUBLIC_` values are **visible in the browser**. That is fine for
> Firebase web config, which is designed to be public. Never put a database
> password or the JWT secret behind that prefix.

5. Deploy.
6. Copy the resulting URL and go back to Railway: set `FRONTEND_URL` to it, and
   redeploy. **If you skip this the browser blocks every API call with a CORS
   error** and the site looks broken with no obvious cause.

### 7.1 Firebase authorised domains

Firebase console -> Authentication -> Settings -> **Authorized domains** -> add
your Vercel domain. Google sign-in fails silently without this.

---

## 8. Verify it actually works

Do all of these. In order.

```bash
API=https://something.up.railway.app

# 1. Alive
curl $API/health

# 2. Dependencies healthy
curl $API/ready          # expect database:ok, redis:ok

# 3. Auth rejects anonymous access
curl -i $API/api/ngo/dashboard   # expect 401

# 4. Rate limiting is on (11th call within a minute should 429)
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code} " $API/api/auth/check-email?email=a@b.com
done; echo
```

Then in a browser:

1. Open your Vercel URL.
2. **Try Demo as Admin** -> dashboard loads with seeded tasks and volunteers.
3. Create a task -> it appears.
4. **Bulk AI assignment** -> assignments are created.
5. Open the chatbot, ask "how many open tasks do I have?" -> **you should get a
   real streamed answer.** (On the Django backend this always returned
   "Stream error." — if you see a real reply, the migration worked.)
6. Open the app in two browser windows as the same NGO. Raise an SOS in one;
   it should appear in the other within a second. That proves Redis pub/sub and
   the WebSocket gateway are working.

### Keyboard/accessibility check
Press **Tab** from the top of any page. You should see a "Skip to main content"
button, then a visible focus ring on every control. On a phone, pinch-zoom
should work. All three were broken before.

---

## 9. Making it zero-downtime

Everything above gives you a working deploy. Two more settings make deploys
invisible to users.

### 9.1 Run at least two replicas

Railway -> **Settings -> Deploy -> Replicas: 2**

With one replica, every deploy is a gap where the site is down. With two,
Railway starts the new version, waits for `/health` to pass, moves traffic, and
only then stops the old one.

**This is only safe because of Redis.** With two replicas and no Redis, live
locations and SOS alerts silently break. Confirm `/ready` shows `redis: ok`
before raising the replica count.

### 9.2 Confirm the healthcheck path

Railway -> Settings -> Healthcheck path: **`/health`** (already set by
`railway.toml`).

Do **not** change it to `/ready`. `/ready` reports database status; if the
database blips for five seconds, Railway would kill every healthy container and
turn a minor blip into a full outage.

### 9.3 Test it

Start a deploy, and while it runs:

```bash
while true; do curl -s -o /dev/null -w "%{http_code}\n" $API/health; sleep 0.5; done
```

You should see an unbroken run of `200`. Any `502`/`503` means replicas or the
healthcheck are misconfigured.

---

## 10. Migrating from the existing Django backend

The Django backend has been removed from the repo (last commit `4b30a80`).
If `sanchaalan-saathi.vercel.app` is live today, leave its **Railway service**
running until you have finished the phases below — that idle service is your
rollback.

```
Phase 1  Deploy the FastAPI service as a NEW Railway service, alongside the
         existing Django one. Same DATABASE_URL. Same JWT_SECRET_KEY.
         Both are now live. Nothing has changed for users.

Phase 2  Run section 8 against the new URL directly.

Phase 3  Change NEXT_PUBLIC_BACKEND_URL on Vercel to the new service. Redeploy.
         Users are now on FastAPI. Nobody is logged out, because the JWT secret
         and claims are identical.

Phase 4  Watch for a week. Django stays running, costing a few dollars, doing
         nothing.

Phase 5  Delete the old Railway service.
```

**Rollback at any point:** set `NEXT_PUBLIC_BACKEND_URL` back to the Django URL
and redeploy Vercel. Takes about a minute. There is no data to roll back,
because both backends use the same tables — which is exactly why the models
were mapped column-for-column instead of being "cleaned up".

---

## 11. Things you must do that are easy to forget

### 11.1 Clean up guest data (do this within the first week)

`POST /api/auth/guest` writes about **35 rows per click** and nothing ever
removes them. Rate limiting slows abuse; it does not clean up. Left alone, your
free Supabase tier fills with abandoned demo workspaces.

Two options.

**Option A — turn the public demo off.** Set `ENABLE_GUEST_MODE=false` on
Railway. Nothing else to do.

**Option B — expire old demo workspaces on a schedule.** In Supabase -> SQL
Editor, always run this preview first:

```sql
SELECT count(*) FROM ngos
 WHERE sector IN ('Demo', 'Hackathon')
   AND created_at < now() - interval '7 days';
```

If that count looks right, schedule a weekly cleanup job with pg_cron
(Supabase -> Integrations -> pg_cron). The job must remove child rows before
parent rows, because these tables carry no foreign keys to cascade for you.
Order: assignments, task_enrollment_requests, tasks, resources, events,
volunteer_profiles, notifications, users, ngos — each filtered to
`ngo_id IN (stale set)`, where the stale set is the query above.

The full statement is in `docs/sql/reap-guest-data.sql`.

It only ever matches NGOs marked `Demo`/`Hackathon` and older than a week. Real
NGOs are never selected. Take a backup before the first run regardless.

### 11.2 Set up alerts

Railway -> Settings -> Notifications: email on deploy failure and on crash.
That is the minimum. Without it, you find out from a user.

### 11.3 Rotate secrets if they leak

Rotating `JWT_SECRET_KEY` logs everyone out. Do it only if it actually leaks,
and expect the support load.

### 11.4 Keep `/metrics` private

`METRICS_TOKEN` must be set. Without it the endpoint is public, and it exposes
your route map and traffic shape.

---

## 12. What this costs

| Service | Free tier | When you outgrow it |
|---|---|---|
| Vercel | 100 GB bandwidth/mo | $20/mo Pro |
| Railway | $5 trial credit, then usage | ~$5-10/mo for 2 small replicas |
| Supabase | 500 MB DB, 2 GB egress | $25/mo Pro |
| Upstash Redis | 10k commands/day | ~$0.20 per 100k after |
| Neo4j Aura | 1 free instance | $65/mo |
| Gemini | Generous free tier | Pay per token |

**Realistic start: $0-5/month. At a few thousand users: $10-25/month.**

The largest avoidable cost is Gemini. `USER_DAILY_TOKEN_LIMIT` and
`GLOBAL_TPM_LIMIT` are your spend caps — lower them if the bill surprises you.

---

## 13. When something breaks

| Symptom | Almost always | Fix |
|---|---|---|
| Site loads, every API call fails | CORS | `FRONTEND_URL` on Railway must exactly match the Vercel URL, no trailing slash |
| Backend will not start | Config validation | Read the deploy log; it names each bad variable |
| `InvalidSQLStatementNameError` | Pooler used for migrations | Migrations need the direct URL (port 5432) |
| `/ready` shows `redis: degraded` | Wrong Redis URL | Use the `rediss://` (TLS) URL |
| Everyone logged out after cutover | `JWT_SECRET_KEY` differs | Must be identical to the Django one |
| SOS not reaching other users | Redis down, or >1 replica without it | Check `/ready` |
| Google sign-in does nothing | Firebase authorised domains | Add the Vercel domain |
| Chatbot says "not configured" | Gemini key missing | Set `GEMINI_API_KEY` |
| Build fails on Railway | Root directory | Must be `services/api` |
| 429 everywhere | Rate limits | Expected; raise them if it is real traffic |

**Reading logs.** Railway -> service -> Deployments -> View Logs. Every line is
JSON with a `request_id`. When a user reports an error, ask for the request id
shown in the UI and search the logs for it — that gives you the exact request
and its stack trace.

---

## 14. Local development

```bash
# Everything at once (Postgres + Redis + API) - needs Docker Desktop
docker compose up

# Or just the API, against your own database
cd services/api
python -m venv .venv
.venv/Scripts/activate            # Windows
# source .venv/bin/activate       # macOS / Linux
pip install -r requirements-dev.txt
cp .env.example .env              # then fill it in
uvicorn app.main:app --reload

# Interactive API docs at http://localhost:8000/docs
# (disabled in production, deliberately - it is a free map of your API)

# Checks
pytest -q                         # 47 tests, no database needed
ruff check app tests
```

Frontend:

```bash
cd apps/web
npm ci
cp .env.example .env.local        # NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
npm run dev
```

---

## 15. Order of operations, one page

1. Create accounts (section 1)
2. Generate three secrets (section 2)
3. Supabase: project, **both** connection strings, backup (section 3)
4. Upstash: Redis, copy the `rediss://` URL (section 4)
5. Gemini / Neo4j / Firebase keys (section 5)
6. Railway: root dir `services/api`, all env vars (section 6)
7. `alembic stamp 0001_baseline`, then `alembic upgrade head` (section 6.3)
8. Generate the Railway domain; check `/health` and `/ready` (section 6.4)
9. Vercel: root dir `apps/web`, env vars (section 7)
10. Set `FRONTEND_URL` on Railway to the Vercel URL; redeploy (section 7)
11. Firebase authorised domains (section 7.1)
12. Verify everything (section 8)
13. Replicas -> 2 (section 9)
14. Schedule guest cleanup (section 11.1)
15. Turn on alerts (section 11.2)

Steps 1-12 give you a working deployment. Step 13 is what makes it
zero-downtime. Step 14 is what stops it filling up.
