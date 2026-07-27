from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
import json
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime
from bson import ObjectId

from langchain_groq import ChatGroq
from langchain_classic.chains import create_history_aware_retriever, create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage

from app.auth.utils import decode_token
from app.core.database import get_db
from app.core.config import settings
from app.chat.schemas import ChatRequest, ChatResponse, ConversationResponse
from app.documents.processor import get_langchain_retriever
from app.core.ai_logger import log_ai_request, TokenTrackingCallback
import time

router = APIRouter(prefix="/chat", tags=["Chat"])
security = HTTPBearer()

llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=settings.GROQ_API_KEY, temperature=0.3)

contextualize_q_system_prompt = (
    "Given a chat history and the latest user question which might reference "
    "context in the chat history, formulate a standalone question which can be "
    "understood without the chat history. Do NOT answer the question, just "
    "reformulate it if needed and otherwise return it as is."
)
contextualize_q_prompt = ChatPromptTemplate.from_messages([
    ("system", contextualize_q_system_prompt),
    MessagesPlaceholder("chat_history"),
    ("human", "{input}"),
])

qa_system_prompt = (
    "You are an AI assistant helping users understand their documents. "
    "Use the following retrieved document context to answer the user's question "
    "accurately and helpfully. If the answer is not in the context, say so clearly.\n\n"
    "{context}"
)
qa_prompt = ChatPromptTemplate.from_messages([
    ("system", qa_system_prompt),
    MessagesPlaceholder("chat_history"),
    ("human", "{input}"),
])

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    email = decode_token(credentials.credentials)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")
    db = get_db()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.post("/query", response_model=ChatResponse)
async def chat_with_document(
    request: ChatRequest,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()

    doc = await db.documents.find_one({
        "_id": ObjectId(request.document_id),
        "user_id": str(current_user["_id"])
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc["status"] != "ready":
        raise HTTPException(status_code=400, detail="Document still processing")

    # Pichli 5 conversations se chat history banao (LangChain message format mein)
    cursor = db.conversations.find({
        "document_id": request.document_id,
        "user_id": str(current_user["_id"])
    }).sort("created_at", -1).limit(5)
    prev_conversations = await cursor.to_list(length=5)

    chat_history = []
    for conv in reversed(prev_conversations):
        for msg in conv["messages"]:
            if msg["role"] == "user":
                chat_history.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "assistant":
                chat_history.append(AIMessage(content=msg["content"]))

    # LangChain retrieval chain banao
    retriever = get_langchain_retriever(request.document_id)
    history_aware_retriever = create_history_aware_retriever(llm, retriever, contextualize_q_prompt)
    question_answer_chain = create_stuff_documents_chain(llm, qa_prompt)
    rag_chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)

    start_time = time.time()
    token_callback = TokenTrackingCallback()
    result = await rag_chain.ainvoke({
        "input": request.question,
        "chat_history": chat_history
    }, config={"callbacks": [token_callback]})
    duration_ms = round((time.time() - start_time) * 1000, 2)

    answer = result["answer"]
    retrieved_docs = result.get("context", [])

    if not retrieved_docs:
        raise HTTPException(status_code=404, detail="No relevant content found")

    sources = [d.page_content for d in retrieved_docs[:3]]

    conversation = {
        "document_id": request.document_id,
        "user_id": str(current_user["_id"]),
        "messages": [
            {"role": "user", "content": request.question, "timestamp": datetime.utcnow()},
            {"role": "assistant", "content": answer, "timestamp": datetime.utcnow()}
        ],
        "created_at": datetime.utcnow()
    }
    await db.conversations.insert_one(conversation)

    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$inc": {"total_conversations": 1, "total_ai_requests": 1}}
    )
    await log_ai_request(db, str(current_user["_id"]), "chat", "llama-3.3-70b-versatile", duration_ms, token_callback.total_tokens)

    return ChatResponse(
        answer=answer,
        sources=sources,
        document_id=request.document_id,
        question=request.question
    )

@router.post("/query/stream")
async def chat_with_document_stream(
    request: ChatRequest,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()

    doc = await db.documents.find_one({
        "_id": ObjectId(request.document_id),
        "user_id": str(current_user["_id"])
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc["status"] != "ready":
        raise HTTPException(status_code=400, detail="Document still processing")

    cursor = db.conversations.find({
        "document_id": request.document_id,
        "user_id": str(current_user["_id"])
    }).sort("created_at", -1).limit(5)
    prev_conversations = await cursor.to_list(length=5)

    chat_history = []
    for conv in reversed(prev_conversations):
        for msg in conv["messages"]:
            if msg["role"] == "user":
                chat_history.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "assistant":
                chat_history.append(AIMessage(content=msg["content"]))

    retriever = get_langchain_retriever(request.document_id)
    history_aware_retriever = create_history_aware_retriever(llm, retriever, contextualize_q_prompt)
    question_answer_chain = create_stuff_documents_chain(llm, qa_prompt)
    rag_chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)

    async def event_generator():
        full_answer = ""
        sources = []
        stream_start = time.time()
        stream_token_callback = TokenTrackingCallback()
        try:
            async for chunk in rag_chain.astream({
                "input": request.question,
                "chat_history": chat_history
            }, config={"callbacks": [stream_token_callback]}):
                if "context" in chunk and not sources:
                    sources = [d.page_content for d in chunk["context"][:3]]
                    yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"
                if "answer" in chunk:
                    full_answer += chunk["answer"]
                    yield f"data: {json.dumps({'type': 'token', 'content': chunk['answer']})}\n\n"

            conversation = {
                "document_id": request.document_id,
                "user_id": str(current_user["_id"]),
                "messages": [
                    {"role": "user", "content": request.question, "timestamp": datetime.utcnow()},
                    {"role": "assistant", "content": full_answer, "timestamp": datetime.utcnow()}
                ],
                "created_at": datetime.utcnow()
            }
            await db.conversations.insert_one(conversation)
            await db.users.update_one(
                {"_id": current_user["_id"]},
                {"$inc": {"total_conversations": 1, "total_ai_requests": 1}}
            )
            stream_duration_ms = round((time.time() - stream_start) * 1000, 2)
            await log_ai_request(db, str(current_user["_id"]), "chat_stream", "llama-3.3-70b-versatile", stream_duration_ms, stream_token_callback.total_tokens)

            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/history/{document_id}")
async def get_chat_history(
    document_id: str,
    skip: int = 0,
    limit: int = 20,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    query = {
        "document_id": document_id,
        "user_id": str(current_user["_id"])
    }
    cursor = db.conversations.find(query).sort("created_at", -1).skip(skip).limit(limit)

    conversations = await cursor.to_list(length=limit)
    for conv in conversations:
        conv["id"] = str(conv["_id"])
        del conv["_id"]

    total = await db.conversations.count_documents(query)

    return {"conversations": conversations, "total": total, "skip": skip, "limit": limit}
