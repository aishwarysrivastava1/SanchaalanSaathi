import asyncio
import json
import logging
from scipy.spatial.distance import cosine
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from db.models import ChatbotSemanticCache
import google.generativeai as genai

logger = logging.getLogger(__name__)

class EmbeddingProvider:
    """
    Abstraction layer for text embeddings via Gemini.
    genai.embed_content is synchronous — wrapped with asyncio.to_thread.
    """
    @staticmethod
    async def get_embedding(text: str) -> list[float]:
        try:
            result = await asyncio.to_thread(
                genai.embed_content,
                model="models/text-embedding-004",
                content=text,
                task_type="semantic_similarity",
            )
            return result["embedding"]
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            return []

class SemanticCache:
    """
    Partitioned in-application cache computing cosine similarity tightly
    integrated over PostgreSQL without pgvector lock-in.
    """
    SIMILARITY_THRESHOLD = 0.85

    @staticmethod
    async def check_cache(db: AsyncSession, prompt: str, intent_category: str = "general") -> dict | None:
        if not db:
            return None # Ephemeral mode bypass

        embedding = await EmbeddingProvider.get_embedding(prompt)
        if not embedding:
            return None
            
        # ANN-lite equivalent: Bound the extraction pool strictly limiting scaling linearly inside DB buckets.
        try:
            res = await db.execute(
                select(ChatbotSemanticCache)
                .where(ChatbotSemanticCache.intent_category == intent_category)
                .order_by(ChatbotSemanticCache.hits.desc(), ChatbotSemanticCache.created_at.desc())
                .limit(50)
            )
            nodes = res.scalars().all()
            
            best_match = None
            highest_sim = 0.0
            
            for node in nodes:
                node_emb = node.embedding
                if not node_emb or len(node_emb) != len(embedding):
                    continue
                
                # cosine provides distance (0 = identical, 2 = opposite). Similarity = 1 - distance
                sim = 1.0 - cosine(embedding, node_emb)
                
                if sim > highest_sim:
                    highest_sim = sim
                    best_match = node
                    
            if highest_sim >= SemanticCache.SIMILARITY_THRESHOLD and best_match:
                logger.info(f"SEMANTIC CACHE HIT: Similarity {highest_sim:.2f}")
                best_match.hits += 1
                await db.commit()
                return {
                    "text": best_match.reply_text,
                    "action": best_match.action_response
                }
                
        except Exception as e:
            logger.error(f"Semantic Cache check failed: {e}", exc_info=True)
            
        return None

    @staticmethod
    async def save_to_cache(db: AsyncSession, prompt: str, reply_text: str, action_response: dict, intent_category: str = "general"):
        if not db:
            return
            
        try:
            embedding = await EmbeddingProvider.get_embedding(prompt)
            if not embedding:
                return
                
            entry = ChatbotSemanticCache(
                input_hash=str(hash(prompt)),
                embedding=embedding,
                action_response=action_response,
                reply_text=reply_text,
                intent_category=intent_category
            )
            db.add(entry)
            await db.commit()
        except Exception as e:
            logger.error(f"Cache save failed: {e}")
            await db.rollback()
