<div align="center">

<img src="apps/web/public/logo/logo-full.png" alt="Sanchaalan Saathi Logo" height="120" width="120" />

# Sanchaalan Saathi


### *From Chaos to Clarity to Confirmed Action*

**AI-powered emergency intelligence platform for NGOs and disaster-response coordinators**

[![Next.js](https://img.shields.io/badge/Next.js_14-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://aistudio.google.com)
[![Neo4j](https://img.shields.io/badge/Neo4j-008CC1?style=for-the-badge&logo=neo4j&logoColor=white)](https://neo4j.com)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)


---

[Features](#-features) · [Architecture](#-architecture) · [Tech Stack](#-tech-stack) · [Quick Start](#-quick-start) · [API Reference](#-api-reference) · [Deploy](#-cloud-deployment)

</div>

---

## The Problem

When disasters strike, NGO coordinators face three compounding failures:

| | Problem | Real Cost |
|---|---|---|
| **Discovery** | Field reports arrive as unstructured WhatsApp messages, photos, and phone calls | Needs go unrecognized for hours |
| **Decision-Making** | No visibility into causal chains — treating symptoms, not root causes | Misallocated volunteers and supplies |
| **Accountability** | No way to confirm tasks are actually completed | Duplicate efforts, wasted resources |

SynapseAI eliminates all three with a single AI-native platform — at **zero infrastructure cost**.

---

## What Makes SynapseAI Different

> Most disaster tools are dashboards. SynapseAI is a **decision engine**.

- **AI at every layer** — ingestion, verification, querying, and matching are all AI-powered
- **Causal graph reasoning** — understands that a flood *causes* road blockages *causing* supply chain failures, not just isolated incidents
- **Mathematically optimal matching** — Hungarian algorithm ensures the best volunteer goes to the right task
- **Gamified accountability** — volunteers earn XP and climb a leaderboard only when AI *confirms* their work
- **100% free-tier** — runs entirely on Neo4j AuraDB Free, Firebase Spark, and Google AI Studio. No credit card required.

---

## Features

### Omnichannel Intelligence Ingestion

- **Text reports** — paste or type; Gemini 2.5 Flash extracts needs, locations, skills, urgency
- **Photo/PDF upload** — OCR and vision analysis; structural damage, medical situations, supply needs
- **Voice calls via Twilio** — phone volunteers dictate field reports; audio transcribed and parsed in real time
- **GPS-aware submissions** — browser geolocation attaches real coordinates to every report; graceful fallback to manual input

### Knowledge Graph Engine

- All ingested data becomes a **Neo4j property graph** with nodes: `Need`, `Location`, `Skill`, `Volunteer`, `Task`
- Edges encode causal pathways: `(Need)-[:CAUSED_BY]->(Need)`, `(Need)-[:REQUIRES_SKILL]->(Skill)`, `(Need)-[:SPAWNED_TASK]->(Task)`
- Natural language queries via **LangChain + Gemini → Cypher** — ask "Which zones have unmet medical needs?" and get live graph answers
- Seeded with a realistic **Urban Flood demo scenario** covering multiple city zones

### Optimal Volunteer Matching

- **Hungarian Algorithm** (scipy `linear_sum_assignment`) computes a globally optimal assignment matrix
- Cost function weighs **haversine distance**, **skill overlap**, and **reputation score** simultaneously
- Auto-triggers after every new ingestion — no manual dispatch required
- Scales from 5 to 500 volunteers without code changes

### Agent-Based Strategy Simulation

- **Mesa simulation engine** models volunteers as autonomous agents competing for tasks
- Compare two allocation strategies side-by-side: *skill-first*, *proximity-first*, *random*
- Outputs a projected timeline: tasks completed per time-step, coverage percentage, estimated resolution time
- Lets coordinators **war-game decisions before committing resources**

### Tactical Dashboard

- Live **Google Maps** with volunteer pins, need hotspots, and predictive coverage overlay
- **Kanban board** — needs and tasks organized by urgency (OPEN → CLAIMED → SUBMITTED → VERIFIED)
- **Stats bar** — total reports, pending needs, active volunteers, coverage percentage
- **Analytics panel** — trend lines and distribution charts
- **NLP query terminal** — type plain English, get live graph data
- **Volunteer registration** with GPS auto-detection

### Volunteer PWA

- **Mobile-first** Progressive Web App — installable on Android and iOS
- Browse open tasks on a live feed with skill-match indicators
- **One-tap claim** — locks the task and notifies the coordinator
- **Photo proof submission** — camera or file upload directly from the field
- Works on **low-bandwidth connections**

### AI-Powered Verification & Gamification

- **Gemini Vision** inspects submitted photos and scores completion confidence
- Auto-awards XP on verified completion — coordinators never manually sign off
- **XP leaderboard** with podium visualization for top 3 volunteers
- **Level system** — 10 levels with thresholds from 0 to 5000 XP
- **Achievement badges** — First Mission, Veteran, Elite, XP Hunter, Legend
- Reputation score carries forward to influence future matching priority

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                      Browser / PWA  :3000                          │
│                                                                   │
│   ┌─────────────────────┐      ┌──────────────────────────────┐   │
│   │  Coordinator         │      │  Volunteer PWA               │   │
│   │  Dashboard           │      │  Feed · Task · Profile       │   │
│   │  Map · Sim · Graph   │      │  Leaderboard · Achievements  │   │
│   └──────────┬──────────┘      └──────────────┬───────────────┘   │
└──────────────┼────────────────────────────────┼───────────────────┘
               │ Next.js API Routes              │ REST / Firestore
               │ /api/tasks, /api/verify         │
┌──────────────▼────────────────────────────────┼───────────────────┐
│              FastAPI Backend  :8000            │                   │
│                                               │                   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────▼────────┐          │
│  │ Ingest Layer │  │ Graph Layer  │  │ Firebase Admin  │          │
│  │              │  │              │  │ Firestore · Auth│          │
│  │ Text / Image │  │ LangChain    │  └─────────────────┘          │
│  │ Voice / GPS  │  │ NLP → Cypher │                               │
│  └──────┬───────┘  └──────┬───────┘                               │
│         │                 │                                        │
│  ┌──────▼───────────────────────────────────────────────────┐     │
│  │              Gemini 2.5 Flash                            │     │
│  │   OCR · Vision · Audio · Entity Extraction · Scoring     │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                    │
│  ┌────────────────────┐   ┌────────────────────┐                  │
│  │ Engine: Matcher    │   │ Engine: Simulator  │                  │
│  │ Hungarian Algo     │   │ Mesa Agent-Based   │                  │
│  │ Haversine + Skills │   │ Strategy Compare   │                  │
│  └────────┬───────────┘   └────────────────────┘                  │
└───────────┼────────────────────────────────────────────────────────┘
            │
    ┌───────▼────────┐
    │  Neo4j AuraDB  │
    │  Knowledge     │
    │  Graph         │
    └────────────────┘
```

**Data flow:**  
`Field Report` → `Gemini Extraction` → `Neo4j Graph` → `Auto-Matcher` → `Volunteer PWA` → `Photo Proof` → `Gemini Verification` → `XP Award`

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | Next.js 14 · React 18 · TypeScript | Unified app router — dashboard + volunteer PWA |
| **Styling** | Tailwind CSS · Custom design system | Brand palette · Responsive · PWA-ready |
| **AI** | Google Gemini 2.5 Flash | Text extraction · Vision · Audio · NL→Cypher |
| **LangChain** | `langchain-google-genai` | Prompt chaining, NLP-to-Cypher pipeline |
| **Graph DB** | Neo4j AuraDB (async v5 driver) | Causal knowledge graph, geospatial queries |
| **Realtime DB** | Firebase Firestore | Task/need state, live feeds, notifications |
| **Auth** | Firebase Auth (Google OAuth) | Coordinator + volunteer identity |
| **Backend** | FastAPI · Python 3.11+ · uvicorn | REST API, background tasks, webhook handling |
| **Matching** | NumPy · SciPy `linear_sum_assignment` | Hungarian algorithm for optimal dispatch |
| **Simulation** | Mesa · NumPy · scikit-learn | Agent-based scenario modelling |
| **Voice** | Twilio (Voice webhook) | Phone-in field report transcription |
| **Maps** | Google Maps JavaScript API | Volunteer pins, hotspot overlay, routing |
| **Containers** | Docker · Docker Compose | One-command local setup |
| **Deployment** | Vercel (frontend) · Render (backend) | Free-tier cloud hosting |

---

## Quick Start

### Option A — Docker (recommended)

```bash
# 1. Clone
git clone https://github.com/aishwarysrivastava1/SynapseAI.git
cd SynapseAI

# 2. Configure credentials
cp apps/web/.env.example apps/web/.env.local
cp services/backend/.env.example services/backend/.env
# Fill in your API keys (see Credentials section below)

# 3. Build and run both services
docker-compose up --build
```

| Service | URL |
|---|---|
| Dashboard + Volunteer PWA | http://localhost:3000 |
| FastAPI backend | http://localhost:8000 |
| Swagger docs | http://localhost:8000/docs |

### Option B — Manual

**Backend**
```bash
cd services/backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # fill in keys
uvicorn main:app --reload --port 8000
```

**Frontend**
```bash
cd apps/web
npm install
cp .env.example .env.local   # fill in keys
npm run dev                  # http://localhost:3000
```

**Load demo data**
```bash
curl -X POST http://localhost:8000/api/seed
```

This seeds the **Urban Flood scenario** — a realistic multi-zone disaster with needs, volunteer assignments, causal chains, and skill requirements.

---

## Credentials

All services are **free-tier only**. No billing required.

| Variable | Service | Where to get it |
|---|---|---|
| `GEMINI_API_KEY` | Google AI Studio | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| `NEO4J_URI` | Neo4j AuraDB Free | [neo4j.com/cloud/aura](https://neo4j.com/cloud/aura/) — create free DB |
| `NEO4J_USER` | Neo4j AuraDB | Same page — default `neo4j` |
| `NEO4J_PASSWORD` | Neo4j AuraDB | Generated on DB creation |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase | Console → Project Settings → Your apps → Web |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin | Console → Service Accounts → Generate new private key |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps | Cloud Console → APIs & Services → Credentials |
| `TWILIO_ACCOUNT_SID` / `AUTH_TOKEN` | Twilio | [twilio.com/console](https://www.twilio.com/console) — optional |
| `NEXT_PUBLIC_BACKEND_URL` | — | URL of your FastAPI instance (default: `http://localhost:8000`) |

---

## API Reference

Full interactive docs at `http://localhost:8000/docs`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/api/ingest/text` | Text report → Gemini → graph + auto-assign |
| `POST` | `/api/ingest/document` | Image/PDF → Gemini Vision → graph |
| `POST` | `/api/ingest/voice` | Twilio webhook → transcribe → graph |
| `GET` | `/api/graph/nodes` | All graph nodes |
| `GET` | `/api/graph/needs` | Active needs |
| `GET` | `/api/graph/volunteers` | Volunteer roster with skills and locations |
| `POST` | `/api/graph/query` | NLP query → LangChain → Cypher → live results |
| `POST` | `/api/sim/run` | Run Mesa simulation for a scenario |
| `POST` | `/api/sim/compare` | Compare two allocation strategies |
| `GET` | `/api/analytics/summary` | Aggregate stats for dashboard |
| `POST` | `/api/seed` | Load Urban Flood demo scenario |

---

## Cloud Deployment

### Backend → Render (Free)

1. Sign in to [render.com](https://render.com) with GitHub
2. **New → Web Service** → connect this repo
3. Root Directory: `services/backend` · Build: `pip install -r requirements.txt` · Start: `uvicorn main:app --host 0.0.0.0 --port 10000`
4. Add all backend env vars → **Deploy**

### Frontend → Vercel (Free)

1. Sign in to [vercel.com](https://vercel.com) with GitHub
2. **Add New → Project** → import this repo
3. Root Directory: `apps/web`
4. Add all frontend env vars; set `NEXT_PUBLIC_BACKEND_URL` to your Render URL
5. **Deploy**

---

## Project Structure

```
SynapseAI/
├── apps/
│   └── web/                        # Unified Next.js 14 app
│       ├── app/
│       │   ├── (dashboard)/        # Coordinator dashboard route group
│       │   ├── (volunteer)/        # Volunteer PWA route group
│       │   │   ├── feed/           # Task feed
│       │   │   ├── leaderboard/    # XP leaderboard + podium
│       │   │   ├── profile/        # Skills, XP bar, achievements
│       │   │   └── task/[id]/      # Task detail + photo submission
│       │   ├── api/                # Next.js API routes
│       │   │   ├── tasks/[id]/claim/
│       │   │   ├── tasks/[id]/submit/
│       │   │   ├── tasks/generate/
│       │   │   └── verify/
│       │   └── login/              # Firebase Google OAuth
│       ├── components/
│       │   ├── dashboard/          # StatsBar, NeedList, TaskKanban, SimulationPanel, AnalyticsPanel
│       │   ├── map/                # SynapseMap (Google Maps + hotspots)
│       │   ├── upload/             # FileUpload (text + image ingestion)
│       │   └── volunteer/          # TaskCard, VoiceBriefing
│       ├── hooks/                  # useFirestore, useLeaderboard, useGeolocation, useToast
│       └── lib/                    # firebase.ts, auth.ts, api.ts
├── services/
│   └── backend/
│       ├── api/                    # FastAPI route handlers
│       ├── engine/
│       │   ├── matcher.py          # Hungarian algorithm dispatcher
│       │   └── simulator.py        # Mesa agent-based simulator
│       └── services/
│           ├── gemini_service.py   # Gemini 2.5 Flash integration
│           ├── langchain_cypher.py # NLP → Cypher pipeline
│           ├── graph_writer.py     # Neo4j write layer + GPS resolution
│           ├── neo4j_service.py    # Async Neo4j driver
│           └── firebase_service.py # Firebase Admin SDK
├── data/
│   └── seed_graph.cypher           # Urban Flood demo scenario
├── docker-compose.yml
└── firestore.rules
```

## License

[MIT](LICENSE) — free to use, modify, and deploy.

---

<div align="center">

*Built with urgency. Designed for impact.*

**SynapseAI — because every second in a disaster counts.**

</div>
