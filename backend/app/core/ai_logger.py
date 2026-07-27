from datetime import datetime

async def log_ai_request(db, user_id: str, feature: str, model: str, duration_ms: float, tokens_used: int = None, status: str = "success"):
    await db.ai_logs.insert_one({
        "user_id": user_id,
        "feature": feature,
        "model": model,
        "duration_ms": duration_ms,
        "tokens_used": tokens_used,
        "status": status,
        "created_at": datetime.utcnow()
    })

from langchain_core.callbacks import BaseCallbackHandler

class TokenTrackingCallback(BaseCallbackHandler):
    """Accumulates total tokens used across all LLM calls within a chain run
    (e.g. multiple calls inside a map_reduce summarization chain)."""
    def __init__(self):
        self.total_tokens = 0

    def on_llm_end(self, response, **kwargs):
        try:
            usage = response.llm_output.get("token_usage", {}) if response.llm_output else {}
            self.total_tokens += usage.get("total_tokens", 0)
        except Exception:
            pass
