import logging
import asyncio
import os
import google.generativeai as genai

logger = logging.getLogger(__name__)

# Ensure Gemini is configured when this module is imported, regardless of import order
genai.configure(api_key=os.environ.get("GEM_KEY", ""))

class LLMOrchestrator:
    """
    Manages Fallback cascading, exponential backoff, and robust generative API executions.
    """
    MAX_RETRIES = 3
    PRIMARY_MODEL = 'gemini-2.5-flash-preview-04-17'
    FALLBACK_MODEL = 'gemini-2.0-flash'
    
    @staticmethod
    async def generate_response_stream(formatted_history: list, content_parts: list, system_instruction: str):
        """
        Executing response generator bounded directly within fallback strategies.
        If Primary model fails or rate limits, attempts Flash gracefully.
        Yields the streaming generator recursively.
        """
        attempt = 0
        current_model = LLMOrchestrator.PRIMARY_MODEL
        
        while attempt < LLMOrchestrator.MAX_RETRIES:
            try:
                model = genai.GenerativeModel(current_model, system_instruction=system_instruction)
                chat = model.start_chat(history=formatted_history)
                return await chat.send_message_async(content_parts, stream=True)
            except Exception as e:
                attempt += 1
                wait_time = 2 ** attempt
                logger.warning(f"LLM Orchestration Error (Attempt {attempt}): {e}. Retrying in {wait_time}s.")
                await asyncio.sleep(wait_time)
                
                # If hitting continuous limits, cascade to a faster fallback model
                if attempt == 2 and current_model != LLMOrchestrator.FALLBACK_MODEL:
                    logger.info(f"Cascading generative endpoint down to fallback: {LLMOrchestrator.FALLBACK_MODEL}")
                    current_model = LLMOrchestrator.FALLBACK_MODEL
                    
        logger.error("LLM Orchestrator exhausted retry loops. Firing systemic failure.")
        raise Exception("Generative Services Unavailable.")
