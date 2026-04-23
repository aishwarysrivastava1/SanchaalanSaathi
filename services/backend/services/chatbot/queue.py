import asyncio
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

class BackpressureManager:
    """
    In-memory concurrency gateway. Bounds active requests globally,
    per-user, and per-session to prevent monopolization.
    
    NOTE: This is instance-local state. On Vercel/serverless each cold-start
    gets a fresh manager, which is acceptable — the limits exist to prevent
    a single instance from being overwhelmed, not for global coordination.
    """
    def __init__(self, global_limit=100, max_queue=500, max_per_user=5, max_per_session=2):
        self.global_limit = global_limit
        self.max_queue = max_queue
        self.max_per_user = max_per_user
        self.max_per_session = max_per_session
        
        self.active_slots = 0
        self.queued_slots = 0
        self.user_counters: dict[str, int] = defaultdict(int)
        self.session_counters: dict[str, int] = defaultdict(int)
        self._semaphore = asyncio.Semaphore(global_limit)

    async def acquire(self, user_id: str, session_id: str) -> None:
        """
        Request execution slot. May block if globally throttled.
        Raises ValueError if rejected (translate to 429).
        """
        if self.queued_slots >= self.max_queue:
            logger.warning("Queue overflow triggered. Emitting 429 rejection.")
            raise ValueError("System is currently experiencing extreme load. Try again.")

        if self.user_counters[user_id] >= self.max_per_user:
            logger.warning(f"User {user_id} throttled globally.")
            raise ValueError("You are sending requests too quickly. Please wait.")
            
        if self.session_counters[session_id] >= self.max_per_session:
            logger.warning(f"Session {session_id} throttled.")
            raise ValueError("Multiple active queries detected. Await current response.")

        self.queued_slots += 1
        try:
            await self._semaphore.acquire()
            self.active_slots += 1
            self.user_counters[user_id] += 1
            self.session_counters[session_id] += 1
        finally:
            self.queued_slots -= 1

    def release(self, user_id: str, session_id: str) -> None:
        """Release execution slot cleanly."""
        if self.user_counters[user_id] > 0:
            self.user_counters[user_id] -= 1
            
        if self.session_counters[session_id] > 0:
            self.session_counters[session_id] -= 1
            
        if self.active_slots > 0:
            self.active_slots -= 1
        self._semaphore.release()

# Global Singleton Manager instance 
queue_manager = BackpressureManager()
