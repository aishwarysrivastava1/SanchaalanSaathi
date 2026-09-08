import json
import logging

import google.generativeai as genai

from app.core.config import settings

logger = logging.getLogger(__name__)

# Configure Gemini once at import. `gemini_key` prefers GEM_KEY then GEMINI_API_KEY,
# matching the precedence the Django stack used.
if settings.gemini_key:
    genai.configure(api_key=settings.gemini_key)
else:
    logger.warning("No Gemini API key set - AI extraction and chat will fail")

EXTRACTION_PROMPT = """You are a data extraction pipeline for an NGO community intelligence knowledge graph.
Analyze the input and extract structured entities and relationships.

RULES:
- Output ONLY valid JSON. No markdown. No explanation. No preamble.
- Urgency scoring: 1.0 = immediate life threat, 0.8 = serious health/safety risk,
  0.5 = significant hardship, 0.3 = quality of life issue, 0.1 = minor inconvenience.
- Include a confidence score (0.0–1.0) for each extracted entity.
- If the input is not in English, translate the content to English before extracting.

OUTPUT SCHEMA:
{{
  "nodes": [
    {{"label": "Need", "properties": {{"type": "water_sanitation|medical|food|shelter|education|infrastructure|safety", "sub_type": "string", "description": "1-2 sentence English summary", "urgency_score": 0.0, "population_affected": 0, "keywords": []}}, "confidence": 0.0}},
    {{"label": "Location", "properties": {{"name": "string", "ward": "string or null", "lat": null, "lng": null}}, "confidence": 0.0}},
    {{"label": "Skill", "properties": {{"name": "string", "category": "medical|technical|logistics|education|construction"}}}}
  ],
  "edges": [
    {{"type": "LOCATED_IN|REQUIRES_SKILL|AFFECTS|CAUSED_BY", "from_index": 0, "to_index": 1}}
  ]
}}

INPUT: {input_text}
SOURCE LANGUAGE: {language}"""


def safe_parse_gemini_json(text: str) -> dict:
    """Parse Gemini response, handling common formatting issues."""
    if not text:
        return {}
    cleaned = text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return json.loads(cleaned.strip())


async def extract_entities(text: str, language: str = "en") -> dict:
    """Extract structured entities from plain text via Gemini 2.5 Flash."""
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = await model.generate_content_async(
            EXTRACTION_PROMPT.format(input_text=text, language=language),
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1
            )
        )
        result = safe_parse_gemini_json(response.text)
        if "nodes" not in result:
            result["nodes"] = []
        if "edges" not in result:
            result["edges"] = []
        return result
    except json.JSONDecodeError as e:
        logger.error(f"Gemini JSON parse failed in extract_entities: {e}")
        return {"error": f"JSON parse failed: {str(e)}", "nodes": [], "edges": []}
    except Exception as e:
        logger.error(f"Gemini extract_entities failed: {e}")
        return {"error": str(e), "nodes": [], "edges": []}


async def extract_entities_from_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """
    Single-call pipeline: image → OCR + entity extraction via Gemini 2.5 Flash.
    Replaces the old Document AI → Gemini two-step pipeline.
    Gemini natively reads handwritten text, printed text, scanned forms, and PDFs
    across scripts including Latin, Devanagari, Tamil, and Bengali.
    """
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        prompt = EXTRACTION_PROMPT.replace(
            "{input_text}",
            "[ATTACHED IMAGE — First extract ALL visible text including handwritten content. "
            "Then extract structured entities from that text. If the text is not in English, "
            "translate it to English before extracting entities.]"
        ).replace("{language}", "auto-detect from image")

        response = await model.generate_content_async(
            [
                prompt,
                {"mime_type": mime_type, "data": image_bytes}
            ],
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1
            )
        )
        result = safe_parse_gemini_json(response.text)
        if "nodes" not in result:
            result["nodes"] = []
        if "edges" not in result:
            result["edges"] = []
        return result
    except json.JSONDecodeError as e:
        logger.error(f"Gemini JSON parse failed in extract_entities_from_image: {e}")
        return {"error": f"JSON parse failed: {str(e)}", "raw_response": response.text if 'response' in dir() else "", "nodes": [], "edges": []}
    except Exception as e:
        logger.error(f"Gemini extract_entities_from_image failed: {e}")
        return {"error": str(e), "nodes": [], "edges": []}


async def extract_entities_from_audio(audio_bytes: bytes, mime_type: str = "audio/wav") -> dict:
    """
    Single-call pipeline: audio → transcription + translation + entity extraction
    via Gemini 2.5 Flash. Replaces the old Cloud STT → Translation API → Gemini
    three-step pipeline. Gemini natively transcribes audio in 100+ languages.
    """
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")

        prompt = """You are a data extraction pipeline for an NGO community intelligence knowledge graph.

STEP 1: Transcribe the attached audio completely. The speaker may use Hindi, Tamil, Bengali, English, or any other language.
STEP 2: Translate the full transcript to English if it is not already in English.
STEP 3: Extract structured entities and relationships from the English transcript.

Output ONLY valid JSON:
{
  "transcript_original": "full transcript in original language",
  "transcript_english": "full English translation",
  "detected_language": "ISO 639-1 code (hi, en, ta, bn, etc.)",
  "nodes": [
    {"label": "Need", "properties": {"type": "water_sanitation|medical|food|shelter|education|infrastructure|safety", "sub_type": "...", "description": "...", "urgency_score": 0.0, "population_affected": 0, "keywords": []}, "confidence": 0.0},
    {"label": "Location", "properties": {"name": "...", "ward": null, "lat": null, "lng": null}, "confidence": 0.0},
    {"label": "Skill", "properties": {"name": "...", "category": "medical|technical|logistics|education|construction"}}
  ],
  "edges": [
    {"type": "LOCATED_IN|REQUIRES_SKILL|AFFECTS|CAUSED_BY", "from_index": 0, "to_index": 1}
  ]
}"""

        response = await model.generate_content_async(
            [
                prompt,
                {"mime_type": mime_type, "data": audio_bytes}
            ],
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1
            )
        )
        result = safe_parse_gemini_json(response.text)
        for key in ["transcript_original", "transcript_english", "detected_language", "nodes", "edges"]:
            if key not in result:
                result[key] = "" if key not in ("nodes", "edges") else []
        return result
    except json.JSONDecodeError as e:
        logger.error(f"Gemini JSON parse failed in extract_entities_from_audio: {e}")
        return {"error": f"JSON parse failed: {str(e)}", "transcript_original": "", "transcript_english": "", "detected_language": "", "nodes": [], "edges": []}
    except Exception as e:
        logger.error(f"Gemini extract_entities_from_audio failed: {e}")
        return {"error": str(e), "transcript_original": "", "transcript_english": "", "detected_language": "", "nodes": [], "edges": []}
