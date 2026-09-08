"""Structured JSON logging with a per-request correlation id."""
from __future__ import annotations

import json
import logging
import re
import sys
from contextvars import ContextVar
from datetime import UTC, datetime

from app.core.config import settings

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

EXTRA_FIELDS = ("method", "path", "status", "duration_ms", "user_id", "ngo_id")
_EMAIL = re.compile(r"([\w.+-])[\w.+-]*@([\w-])[\w.-]*\.([A-Za-z]{2,})")

NOISY_LOGGERS = {
    "neo4j.notifications": logging.WARNING,
    "httpx": logging.WARNING,
    "sqlalchemy.engine": logging.WARNING,
    "google_genai": logging.WARNING,
}


def mask_pii(text: str) -> str:
    """Request logs routinely carry email addresses; they do not belong here."""
    return _EMAIL.sub(lambda m: f"{m.group(1)}***@{m.group(2)}***.{m.group(3)}", text)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": datetime.now(tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "service": settings.service_name,
            "request_id": request_id_var.get(),
            "message": mask_pii(record.getMessage()),
        }
        entry.update(
            {field: getattr(record, field) for field in EXTRA_FIELDS if hasattr(record, field)}
        )
        if record.exc_info:
            entry["exception"] = mask_pii(self.formatException(record.exc_info))
        return json.dumps(entry, default=str)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    if settings.deployment_env == "development":
        handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s - %(message)s"))
    else:
        handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level)

    for name, level in NOISY_LOGGERS.items():
        logging.getLogger(name).setLevel(level)
