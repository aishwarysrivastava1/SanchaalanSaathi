# syntax=docker/dockerfile:1

# ── Build stage ───────────────────────────────────────────────────────────────
# Wheels are built here and only the installed venv is copied forward, so the
# compilers never ship to production.
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install --upgrade pip \
 && /opt/venv/bin/pip install -r requirements.txt

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONFAULTHANDLER=1

# curl is present only so the HEALTHCHECK below can run.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 appuser

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app
COPY --chown=appuser:appuser . .

# Never run the app as root.
USER appuser

EXPOSE 8000

# Liveness only. Never point this at /ready -- a momentary database blip would
# make the platform kill a container that is otherwise perfectly healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:${PORT:-8000}/health || exit 1

# Uvicorn workers speak both HTTP and WebSocket, so one process type serves
# everything. `--timeout-graceful-shutdown` is what makes a rolling deploy
# actually drain, instead of severing in-flight requests and live sockets the
# moment the old container is told to stop.
CMD ["sh", "-c", "exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port ${PORT:-8000} \
    --workers ${WEB_CONCURRENCY:-2} \
    --timeout-graceful-shutdown 30 \
    --proxy-headers \
    --forwarded-allow-ips '*' \
    --no-server-header"]
