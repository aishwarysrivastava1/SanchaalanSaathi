import firebase_admin
from firebase_admin import credentials, firestore
import os
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class FirebaseService:
    def __init__(self):
        self.db = None
        self.initialize_firebase()

    def initialize_firebase(self):
        try:
            # Check if already initialized
            if not firebase_admin._apps:
                service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
                if not service_account_json:
                    logger.error("FIREBASE_SERVICE_ACCOUNT_JSON not found in environment variables.")
                    return

                # The JSON might be a string, let's parse it
                try:
                    cred_dict = json.loads(service_account_json)
                    cred = credentials.Certificate(cred_dict)
                    firebase_admin.initialize_app(cred)
                    logger.info(f"Firebase Admin initialized for project: {cred_dict.get('project_id')}")
                except json.JSONDecodeError as je:
                    logger.error(f"Invalid JSON format for FIREBASE_SERVICE_ACCOUNT_JSON: {je}")
                    return
                except Exception as e:
                    logger.error(f"Secondary Firebase initialization error: {e}")
                    return

            self.db = firestore.client()
        except Exception as e:
            logger.error(f"Error initializing Firestore: {e}")

    def add_notification(self, title: str, message: str, n_type: str = "INFO"):
        """Adds a notification to the Firestore 'notifications' collection."""
        if not self.db:
            logger.error("Firestore DB not initialized. Cannot add notification.")
            return

        try:
            notification_data = {
                "title": title,
                "message": message,
                "type": n_type,
                "timestamp": datetime.utcnow(),
                "read": False
            }
            self.db.collection("notifications").add(notification_data)
            logger.info(f"Notification added: {title}")
        except Exception as e:
            logger.error(f"Failed to add notification: {e}")

    def create_task_from_need(self, need_id: str, need_data: dict):
        """Creates a corresponding task in Firestore when a need is created."""
        if not self.db:
            return
            
        try:
            # Default coordinates to Delhi center if not provided
            lat = need_data.get('lat')
            lng = need_data.get('lng')
            if lat is None or lng is None:
                lat, lng = 28.6139, 77.2090
                logger.warning(f"Missing coordinates for need {need_id}, defaulting to {lat}, {lng}")

            task_ref = self.db.collection("tasks").document(need_id)
            task_ref.set({
                "neoNeedId": need_id,
                "title": f"Need: {need_data.get('type', 'Unknown').upper()}",
                "description": need_data.get("description", ""),
                "status": "OPEN",
                "createdAt": datetime.utcnow(),
                "urgency": need_data.get("urgency_score", 0.5),
                "location": {
                    "lat": float(lat),
                    "lng": float(lng),
                    "name": need_data.get("location_name", "Unknown Area")
                },
                "xpReward": int(need_data.get("urgency_score", 0.5) * 1000)
            })
            logger.info(f"Task created in Firestore for need: {need_id}")
        except Exception as e:
            logger.error(f"Failed to create task in Firestore: {e}")

firebase_service = FirebaseService()
