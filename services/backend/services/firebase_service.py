import ast
import firebase_admin
from firebase_admin import credentials, firestore
import os
import json
import base64
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def _try_parse(candidate: str) -> dict | None:
    """Try multiple JSON repair strategies on a single string candidate."""
    attempts = [
        candidate,
        candidate.replace("\\\\n", "\\n"),                          # double-escaped newlines
        candidate.replace("\r\n", "\\n").replace("\r", "\\n"),      # literal CRLF inside value
        candidate.replace("\n", "\\n"),                              # literal LF inside value
    ]
    for s in attempts:
        try:
            result = json.loads(s)
            if isinstance(result, dict):
                return result
        except (json.JSONDecodeError, ValueError):
            pass

    # Fallback: Python dict literal format (keys/values without quotes).
    # Happens when service account is copy-pasted via str(dict) instead of json.dumps().
    try:
        result = ast.literal_eval(candidate)
        if isinstance(result, dict):
            return result
    except Exception:
        pass

    return None


def _parse_service_account_json(raw: str) -> dict | None:
    """
    Robustly parse FIREBASE_SERVICE_ACCOUNT_JSON from Render / Railway / Vercel.

    Strategies tried in order:
      1. Raw value directly
      2. Strip surrounding quotes
      3. Strip all surrounding whitespace
      4. Base64 standard decode  (handles standard + URL-safe + missing padding)
      5. Each candidate also gets double-escape repair and CRLF repair
    """
    # Build candidate strings to try
    candidates: list[str] = []

    # 1. Raw as-is
    candidates.append(raw)

    # 2. Strip outer whitespace
    stripped = raw.strip()
    if stripped not in candidates:
        candidates.append(stripped)

    # 3. Strip outer quotes (some platforms wrap in single/double quotes)
    unquoted = stripped.strip("'\"")
    if unquoted not in candidates:
        candidates.append(unquoted)

    # 4. Base64 variants — try standard, URL-safe, and with re-padded value
    for b64_input in {raw.strip(), unquoted}:
        for altchars in (None, b"-_"):          # standard vs URL-safe
            for pad in ("", "=", "==", "==="):  # fix missing padding
                try:
                    padded = b64_input + pad
                    decoded = (
                        base64.b64decode(padded, altchars=altchars)
                        if altchars
                        else base64.b64decode(padded)
                    )
                    text = decoded.decode("utf-8")
                    if text not in candidates:
                        candidates.append(text)
                    break  # padding worked — no need to try more padding
                except Exception:
                    continue

    # Try every candidate through every JSON repair strategy
    for i, candidate in enumerate(candidates):
        result = _try_parse(candidate)
        if result is not None:
            logger.info(f"FIREBASE_SERVICE_ACCOUNT_JSON parsed via candidate[{i}]")
            return result

    # Diagnostic: log first 120 chars and length to help diagnose format issues
    logger.error(
        f"FIREBASE_SERVICE_ACCOUNT_JSON parse failed. "
        f"len={len(raw)}, first_chars={repr(raw[:120])}"
    )
    return None


class FirebaseService:
    def __init__(self):
        self.db = None
        self.initialize_firebase()

    def initialize_firebase(self):
        try:
            if not firebase_admin._apps:
                service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
                if not service_account_json:
                    logger.error("FIREBASE_SERVICE_ACCOUNT_JSON not found in environment variables.")
                    return
                cred_dict = _parse_service_account_json(service_account_json)
                if cred_dict is None:
                    logger.error(
                        "Could not parse FIREBASE_SERVICE_ACCOUNT_JSON. "
                        "Paste the raw JSON value in Render — do not add extra quotes. "
                        "Alternatively, base64-encode the JSON and paste the encoded string."
                    )
                    return
                try:
                    cred = credentials.Certificate(cred_dict)
                    firebase_admin.initialize_app(cred)
                    logger.info(f"Firebase Admin initialized for project: {cred_dict.get('project_id')}")
                except Exception as e:
                    logger.error(f"Firebase initialization error: {e}")
                    return

            self.db = firestore.client()
        except Exception as e:
            logger.error(f"Error initializing Firestore: {e}")

    # ── Notifications ─────────────────────────────────────────────────────────

    def add_notification(self, title: str, message: str, n_type: str = "INFO"):
        """Adds a notification to the Firestore 'notifications' collection."""
        if not self.db:
            return
        try:
            self.db.collection("notifications").add({
                "title": title,
                "message": message,
                "type": n_type,
                "timestamp": datetime.utcnow(),
                "read": False
            })
            logger.info(f"Notification added: {title}")
        except Exception as e:
            logger.error(f"Failed to add notification: {e}")

    # ── Needs (real-time sync) ─────────────────────────────────────────────────

    def sync_need_to_firestore(self, need_id: str, need_data: dict):
        """Writes a Need from Neo4j to Firestore so the frontend gets real-time updates."""
        if not self.db:
            return
        try:
            lat = need_data.get("lat") or 28.6139
            lng = need_data.get("lng") or 77.2090
            self.db.collection("needs").document(need_id).set({
                "id": need_id,
                "type": need_data.get("type", "unknown"),
                "sub_type": need_data.get("sub_type", ""),
                "description": need_data.get("description", ""),
                "urgency_score": float(need_data.get("urgency_score", 0.5)),
                "population_affected": int(need_data.get("population_affected", 1)),
                "status": need_data.get("status", "PENDING"),
                "location": {
                    "lat": float(lat),
                    "lng": float(lng),
                    "name": need_data.get("location_name", "Unknown Area"),
                },
                "reported_at": datetime.utcnow(),
                "tasks_spawned": 0,
            })
            logger.info(f"Need synced to Firestore: {need_id}")
        except Exception as e:
            logger.error(f"Failed to sync need to Firestore: {e}")

    def update_need_status(self, need_id: str, status: str):
        """Updates the status of a need in Firestore."""
        if not self.db:
            return
        try:
            self.db.collection("needs").document(need_id).update({
                "status": status,
                "updated_at": datetime.utcnow(),
            })
        except Exception as e:
            logger.error(f"Failed to update need status in Firestore: {e}")

    # ── Tasks ──────────────────────────────────────────────────────────────────

    def create_task_from_need(self, need_id: str, need_data: dict):
        """Creates a corresponding task in Firestore when a need is created."""
        if not self.db:
            return
        try:
            lat = need_data.get("lat") or 28.6139
            lng = need_data.get("lng") or 77.2090
            self.db.collection("tasks").document(need_id).set({
                "neoNeedId": need_id,
                "title": f"Need: {need_data.get('type', 'Unknown').upper()}",
                "description": need_data.get("description", ""),
                "status": "OPEN",
                "createdAt": datetime.utcnow(),
                "urgency": float(need_data.get("urgency_score", 0.5)),
                "location": {
                    "lat": float(lat),
                    "lng": float(lng),
                    "name": need_data.get("location_name", "Unknown Area"),
                },
                "xpReward": int(need_data.get("urgency_score", 0.5) * 1000),
            })
            logger.info(f"Task created in Firestore for need: {need_id}")
        except Exception as e:
            logger.error(f"Failed to create task in Firestore: {e}")

    # ── Activity feed ──────────────────────────────────────────────────────────

    def log_activity(self, event_type: str, title: str, description: str, metadata: dict = None):
        """Writes a real-time activity event to the 'activity' Firestore collection."""
        if not self.db:
            return
        try:
            self.db.collection("activity").add({
                "type": event_type,
                "title": title,
                "description": description,
                "timestamp": datetime.utcnow(),
                "metadata": metadata or {},
            })
        except Exception as e:
            logger.error(f"Failed to log activity: {e}")

firebase_service = FirebaseService()
