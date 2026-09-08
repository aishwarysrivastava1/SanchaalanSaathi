"""Prometheus metrics."""
from __future__ import annotations

import time

from fastapi import Request
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import PlainTextResponse, Response

from app.core.config import settings

http_requests = Counter(
    "http_requests_total", "HTTP requests", ["method", "route", "status", "module"]
)
http_latency = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["method", "route"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)
ws_connections = Gauge("realtime_ws_connections", "Open realtime WebSocket connections")
chatbot_requests = Counter("chatbot_requests_total", "Chatbot requests", ["outcome"])
assignment_runs = Counter("assignment_optimizer_runs_total", "Bulk assignment runs", ["solver"])


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        started = time.perf_counter()
        response = await call_next(request)

        # Label by route template, never the raw path: otherwise every task id
        # becomes its own label value and cardinality explodes.
        route = request.scope.get("route")
        template = getattr(route, "path", request.url.path)

        http_requests.labels(
            request.method, template, str(response.status_code), settings.services
        ).inc()
        http_latency.labels(request.method, template).observe(time.perf_counter() - started)
        return response


async def metrics_endpoint(request: Request) -> Response:
    expected = settings.metrics_token
    if expected:
        supplied = request.headers.get("x-metrics-token") or request.query_params.get("token")
        if supplied != expected:
            return PlainTextResponse("Forbidden", status_code=403)
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
