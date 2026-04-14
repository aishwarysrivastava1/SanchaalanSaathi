from fastapi import APIRouter, File, UploadFile, HTTPException, Form, Request, BackgroundTasks, Header, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
import os
import io
import urllib.request
import logging
from twilio.twiml.voice_response import VoiceResponse
from twilio.request_validator import RequestValidator

from services.gemini_service import extract_entities, extract_entities_from_image, extract_entities_from_audio
from services.graph_writer import write_extraction_to_graph
from engine.matcher import perform_auto_assignment

logger = logging.getLogger(__name__)
router = APIRouter()

TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
validator = RequestValidator(TWILIO_AUTH_TOKEN)

# --- Helper for Twilio Validation ---
async def verify_twilio_signature(request: Request, x_twilio_signature: str = Header(None)):
    if not TWILIO_AUTH_TOKEN:
        logger.warning("TWILIO_AUTH_TOKEN not set, skipping strict signature validation.")
        return True
    
    url = str(request.url)
    form_data = await request.form()
    params = {k: v for k, v in form_data.items()}
    
    if not validator.validate(url, params, x_twilio_signature or ""):
        logger.error("Twilio signature validation failed.")
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")
    return True

async def process_voice_recording(recording_url: str):
    try:
        req = urllib.request.Request(recording_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            audio_data = response.read()

        extraction = await extract_entities_from_audio(audio_data, "audio/wav")
        await write_extraction_to_graph(extraction)
        await perform_auto_assignment() # Run in the same background thread for voice
        logger.info("Voice report ingested and auto-assigned successfully")
    except Exception as e:
        logger.error(f"Failed to process voice recording: {e}")

# --- API Routes ---

from pydantic import BaseModel, Field
from typing import Optional

class TextIngestReq(BaseModel):
    text: str = Field(..., min_length=10, max_length=2000)
    language: Optional[str] = "en"

@router.post("/text")
async def ingest_text(req: TextIngestReq, background_tasks: BackgroundTasks):
    extraction = await extract_entities(req.text, req.language)
    if not extraction or "error" in extraction and extraction["error"]:
        raise HTTPException(status_code=500, detail=extraction.get("error", "Unknown extraction error"))
        
    need_id = await write_extraction_to_graph(extraction)
    if not need_id:
        raise HTTPException(status_code=500, detail="Failed to write graph entities")
    
    # Trigger Auto-Assignment 
    background_tasks.add_task(perform_auto_assignment)
    
    return {"success": True, "need_id": need_id, "nodes_created": len(extraction.get("nodes", []))}

@router.post("/document")
async def ingest_document(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    image_bytes = await file.read()
    mime_type = file.content_type or "image/jpeg"
    
    extraction = await extract_entities_from_image(image_bytes, mime_type)
    if not extraction or "error" in extraction and extraction["error"]:
        raise HTTPException(status_code=500, detail=extraction.get("error", "Unknown extraction error"))
        
    need_id = await write_extraction_to_graph(extraction)
    
    # Trigger Auto-Assignment 
    background_tasks.add_task(perform_auto_assignment)
    
    return {"success": True, "need_id": need_id, "text_extracted": "Processed natively via Gemini Vision"}

@router.post("/voice", dependencies=[Depends(verify_twilio_signature)])
async def ingest_voice(request: Request):
    """Unified entry point for Twilio Voice Ingestion.
    Spec: POST /api/ingest/voice
    """
    response = VoiceResponse()
    response.say(
        "Welcome to SYNAPSE AI Emergency Dispatch. Please state your location, your need, and any required skills clearly after the beep.", 
        language="hi-IN", voice="Polly.Aditi"
    )
    # Callback uses the same router but a sub-path for clarity
    response.record(max_length=60, action="/api/ingest/voice/recording", play_beep=True)
    response.say("Goodbye.", language="hi-IN", voice="Polly.Aditi")
    return Response(content=str(response), media_type="application/xml")

@router.post("/voice/recording", dependencies=[Depends(verify_twilio_signature)])
async def voice_recording_callback(request: Request, background_tasks: BackgroundTasks):
    """Secondary webhook triggered by Twilio after recording."""
    form_data = await request.form()
    recording_url = form_data.get("RecordingUrl")
    
    if recording_url:
         background_tasks.add_task(process_voice_recording, recording_url + ".wav")
         
    response = VoiceResponse()
    response.say("Your report has been received. Help will be coordinated shortly. Goodbye.", language="hi-IN", voice="Polly.Aditi")
    return Response(content=str(response), media_type="application/xml")
