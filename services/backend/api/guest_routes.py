import datetime
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from db.base import get_db
from db.models import Guest, GuestData
from pydantic import BaseModel

router = APIRouter(prefix="/guest", tags=["guest"])

class GuestDataMerge(BaseModel):
    data: dict

async def _ensure_guest_exists(db: AsyncSession, guest_id: str):
    """Lazily initializes the user database profile."""
    guest = (await db.execute(select(Guest).where(Guest.id == guest_id))).scalar_one_or_none()
    if not guest:
        new_guest = Guest(id=guest_id)
        new_data = GuestData(guest_id=guest_id, data={})
        db.add(new_guest)
        db.add(new_data)
        await db.commit()
    else:
        # Keep alive
        await db.execute(
            update(Guest).where(Guest.id == guest_id)
            .values(last_active_at=datetime.datetime.utcnow())
        )
        await db.commit()

@router.get("/session")
async def get_guest_session(request: Request, db: AsyncSession = Depends(get_db)):
    guest_id = request.state.guest_id
    await _ensure_guest_exists(db, guest_id)

    record = (await db.execute(select(GuestData).where(GuestData.guest_id == guest_id))).scalar_one_or_none()
    return {"guest_id": guest_id, "data": record.data if record else {}}

@router.post("/data")
async def post_guest_data(payload: GuestDataMerge, request: Request, db: AsyncSession = Depends(get_db)):
    guest_id = request.state.guest_id
    await _ensure_guest_exists(db, guest_id)
    
    record = (await db.execute(select(GuestData).where(GuestData.guest_id == guest_id))).scalar_one_or_none()
    
    if record:
        new_data = dict(record.data)
        new_data.update(payload.data)
        record.data = new_data
    
    await db.commit()
    return {"status": "saved", "data": record.data if record else payload.data}
