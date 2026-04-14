# Synapse AI

> **"From Chaos to Clarity to Confirmed Action"**

**Synapse AI** is a cost-free, keyless community intelligence platform built for emergency management. It solves three core problems facing NGOs and disaster-response coordinators:

| Problem | Solution |
|---------|----------|
| **Discovery** — How do we know what's needed? | Omnichannel ingestion (text, photos, voice calls) processed by Gemini 2.5 Flash |
| **Decision-Making** — What do we do first? | Live knowledge graph of causal pathways; hotspot visualisation; strategy simulations |
| **Accountability** — Was it actually done? | Volunteers submit completion photos; Gemini Vision verifies before awarding XP |

Built by **Team CrownBreakers** for the Google International Hackathon — Smart Resource Allocation for NGOs.

Contributors: **Aishwary Srivastava, Eshaan Singla, Sukhmanpreet Singh**

---

## Features

- **Omnichannel Ingestion** — Accept text reports, image uploads, and Twilio phone calls. Gemini 2.5 Flash handles OCR, translation, and audio transcription natively, with no paid GCP APIs required.
- **Knowledge Graph** — Unstructured inputs are translated by Gemini into structured Neo4j graph nodes and relationships: `Need → Requires Skill → Spawned Task`.
- **Tactical Dashboard** — Next.js command centre with live Google Maps, a need/task list, stats bar, and an NLP-to-Cypher query terminal.
- **Predictive Hotspots** — Visualise geographic clusters of high-need areas across the map in real time.
- **Strategy Simulations** — Compare recovery timelines across resource-allocation strategies using an agent-based Mesa simulation engine.
- **Volunteer PWA** — Mobile-first progressive web app: browse tasks, claim work, submit photo proof.
- **AI Verification** — Gemini Vision scores volunteer photo submissions and awards XP on confirmed completion.
- **Free-Tier Only** — Designed to run entirely on Neo4j AuraDB Free, Firebase Spark, and Google AI Studio (no billing required).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser / PWA                         │
│                       apps/web  :3000                        │
│   Dashboard  ·  Volunteer Feed  ·  Task Detail  ·  Map       │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST / JSON
┌───────────────────────────▼─────────────────────────────────┐
│               FastAPI Backend  services/backend  :8000        │
│                                                              │
│  /api/ingest  →  Gemini 2.5 Flash  →  Graph Writer           │
│  /api/graph   →  Neo4j Async Driver                          │
│  /api/sim     →  Mesa Simulation Engine                      │
│  /api/seed    →  Demo data loader                            │
└──────────┬───────────────────────────────┬──────────────────┘
           │                               │
    ┌──────▼──────┐                 ┌──────▼──────┐
    │   Neo4j     │                 │  Firebase   │
    │  AuraDB     │                 │  Firestore  │
    │  (Graph DB) │                 │  (Tasks/    │
    └─────────────┘                 │   Needs)    │
                                    └─────────────┘
```

**External APIs used:**
- Google Gemini 2.5 Flash — text, vision, and audio processing
- Neo4j AuraDB — graph database
- Firebase Firestore + Auth — real-time task/need storage and auth
- Google Maps JavaScript API — geospatial visualisation
- Twilio — inbound voice call handling

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.11+, uvicorn |
| AI | Google Gemini 2.5 Flash (`google-generativeai`), LangChain |
| Graph DB | Neo4j AuraDB (async driver v5) |
| Auth & Storage | Firebase Auth, Firestore, Firebase Admin SDK |
| Simulation | Mesa (agent-based modelling), NumPy, scikit-learn |
| Voice | Twilio |
| Maps | Google Maps JavaScript API |
| Containerisation | Docker, Docker Compose |

---

## Project Structure

```
synapse-ai/
├── apps/
│   ├── web/                   # Main unified Next.js app (dashboard + volunteer PWA)
│   │   ├── app/               # App Router pages and API routes
│   │   ├── components/        # UI components (map, dashboard, volunteer, upload)
│   │   ├── hooks/             # Custom React hooks (Firestore)
│   │   ├── lib/               # Firebase, auth, API client, shared types
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── dashboard/             # Standalone advanced dashboard (deck.gl, force-graph)
│   └── volunteer/             # Standalone volunteer PWA (react-webcam, PWA)
├── services/
│   └── backend/               # FastAPI intelligence core
│       ├── api/               # Route handlers (graph, ingest, seed, simulation, voice)
│       ├── engine/            # Matchmaker and Mesa simulator
│       ├── services/          # Gemini, Neo4j, graph writer, LangChain/Cypher
│       ├── main.py            # FastAPI app entry point
│       ├── requirements.txt
│       └── Dockerfile
├── data/
│   └── seed_graph.cypher      # Urban flood demo scenario for Neo4j
├── firestore.rules            # Firestore security rules
└── docker-compose.yml
```

---

## Prerequisites

- **Docker & Docker Compose** (recommended for Quick Start) — or:
  - Node.js 18+ and npm
  - Python 3.11+ — **Windows:** during installation, check **"Add Python to PATH"**
- API credentials (all free tier) — see [Obtaining API Keys](#obtaining-api-keys) below

---

## Obtaining API Keys

All services used have a free tier. Create accounts and collect the following:

**1. Google Gemini API Key**
Go to [Google AI Studio](https://aistudio.google.com/app/apikey) → click **Get API Key** → **Create API key**.

**2. Neo4j AuraDB (Graph Database)**
Go to [neo4j.com/cloud/aura](https://neo4j.com/cloud/aura/) → create a **Free** database.
Save the **Connection URI** (`neo4j+s://...`) and the generated **Password**.

**3. Firebase (Auth + Firestore)**
Go to [Firebase Console](https://console.firebase.google.com/) → create a project.
- **Client keys:** Project Settings → Your apps → Add Web App → copy the config values.
- **Admin key (`FIREBASE_SERVICE_ACCOUNT_JSON`):** Project Settings → Service Accounts → **Generate new private key** → download the `.json` file → open it and paste the entire contents as a single-line string into your `.env`.

**4. Google Maps**
Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → **Create API key**.
Enable the **Maps JavaScript API** for that key.

**5. Twilio (optional — voice ingestion only)**
Go to [twilio.com/console](https://www.twilio.com/console) → copy your **Account SID** and **Auth Token** → buy or use a trial phone number.

---

## Quick Start (Docker)

```bash
# 1. Clone the repo
git clone https://github.com/aishwarysrivastava1/SynapseAI.git
cd synapse-ai

# 2. Set up environment variables
cp .env.example .env.local
# Edit .env.local and fill in your API keys

# 3. Copy env files to sub-services
cp apps/web/.env.example apps/web/.env.local
cp services/backend/.env.example services/backend/.env
# Fill in the same values

# 4. Build and run
docker-compose up --build
```

| Service | URL |
|---------|-----|
| Frontend (Dashboard + Volunteer PWA) | http://localhost:3000 |
| Backend API (FastAPI) | http://localhost:8000 |
| API Docs (Swagger UI) | http://localhost:8000/docs |

---

## Manual Setup

### Backend

```bash
cd services/backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Start the server
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd apps/web

npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your credentials

npm run dev     # Development — http://localhost:3000
npm run build   # Production build
npm start       # Production server
```

---

## Environment Variables

Copy [`.env.example`](.env.example) to `.env.local` (root), [`apps/web/.env.example`](apps/web/.env.example) to `apps/web/.env.local`, and [`services/backend/.env.example`](services/backend/.env.example) to `services/backend/.env`.

| Variable | Used By | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | Backend | Google Gemini 2.5 Flash API key |
| `NEO4J_URI` | Backend | Neo4j connection URI (e.g. `neo4j+s://xxx.databases.neo4j.io`) |
| `NEO4J_USER` | Backend | Neo4j username |
| `NEO4J_PASSWORD` | Backend | Neo4j password |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Frontend | Firebase web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Frontend | Firebase auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Frontend + Backend | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Frontend | Firebase Storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Frontend | Firebase messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Frontend | Firebase app ID |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Frontend (API routes) + Backend | Firebase Admin service account (full JSON string) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Frontend | Google Maps JavaScript API key |
| `TWILIO_ACCOUNT_SID` | Frontend (API routes) | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Frontend (API routes) | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Frontend (API routes) | Twilio phone number (E.164 format) |
| `NEXT_PUBLIC_BACKEND_URL` | Frontend | URL of the FastAPI backend (default: `http://localhost:8000`) |

---

## API Reference

All endpoints are documented interactively at `http://localhost:8000/docs` (Swagger UI).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/ingest/text` | Ingest a text report → Gemini extracts needs → writes to graph |
| `POST` | `/api/ingest/image` | Ingest an image → Gemini Vision → needs → graph |
| `POST` | `/api/ingest/voice` | Process a Twilio voice webhook → transcribe → needs → graph |
| `GET` | `/api/graph/nodes` | Fetch all graph nodes |
| `GET` | `/api/graph/needs` | Fetch all active needs |
| `POST` | `/api/graph/query` | Natural language query → LangChain → Cypher → results |
| `POST` | `/api/sim/run` | Run a Mesa agent-based simulation |
| `POST` | `/api/sim/compare` | Compare two strategy scenarios |
| `POST` | `/api/seed` | Seed the database with the Urban Flood demo scenario |

---

## Seeding Demo Data

To load the Urban Flood scenario for a live demo:

```bash
# Option 1: HTTP request (server must be running)
curl -X POST http://localhost:8000/api/seed

# Option 2: Run the Cypher script directly against Neo4j
# Open Neo4j Browser → paste contents of data/seed_graph.cypher
```

This creates a realistic graph of flood-related needs, skills, tasks, and volunteer assignments across several city zones.

---

## Apps Overview

| App | Path | Description |
|-----|------|-------------|
| **Web** (main) | `apps/web/` | Unified Next.js 14 app — admin dashboard and volunteer PWA in one deployment |
| **Dashboard** (advanced) | `apps/dashboard/` | Standalone dashboard with deck.gl 3D layers, React Force Graph visualisation, and direct Neo4j driver integration |
| **Volunteer** (PWA) | `apps/volunteer/` | Standalone volunteer PWA with webcam capture and offline-first capabilities |

The `apps/web` app is the primary deployment target wired into `docker-compose.yml`. The `dashboard` and `volunteer` apps are alternate standalone frontends for specific deployment scenarios.

---

## Cloud Deployment

### Backend → Render.com (Free)

1. Go to [render.com](https://render.com) and sign in with GitHub.
2. Click **New +** → **Web Service** → connect this repo.
3. Set the following:
   - **Root Directory:** `services/backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port 10000`
4. Add all backend environment variables under **Environment**.
5. Deploy — copy the live URL Render provides (e.g. `https://synapse-backend.onrender.com`).

### Frontend → Vercel (Free)

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **Add New** → **Project** → import this repo.
3. Set **Root Directory** to `apps/web`.
4. Add all frontend environment variables, setting `NEXT_PUBLIC_BACKEND_URL` to your Render URL from above.
5. Click **Deploy**.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "feat: describe your change"`
4. Push to your fork: `git push origin feature/your-feature`
5. Open a Pull Request

Please ensure your `.env.local` / `.env` files are never committed — they are excluded by `.gitignore`.

---

## License

[MIT](LICENSE)
