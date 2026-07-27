from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from groq import Groq
from bson import ObjectId
from datetime import datetime
import re
import json

from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.documents import Document
from langchain_classic.chains.summarize import load_summarize_chain

from app.auth.utils import decode_token
from app.core.database import get_db
from app.core.config import settings
from app.ai.schemas import (
    SummaryRequest, SummaryResponse,
    QuestionRequest, QuestionResponse,
    SentimentResponse, NERResponse,
    ComparisonRequest, ComparisonResponse,
    TranslationRequest, TranslationResponse
)
from app.documents.processor import search_similar_chunks, get_all_chunks
from app.ai.nlp_models import extract_entities_spacy, analyze_sentiment_overall, analyze_sentiment_per_sentence
from app.core.ai_logger import log_ai_request, TokenTrackingCallback
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.units import inch
import io as _io
import time

router = APIRouter(prefix="/ai", tags=["AI Features"])
security = HTTPBearer()
groq_client = Groq(api_key=settings.GROQ_API_KEY)

llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=settings.GROQ_API_KEY, temperature=0.3)

MAP_REDUCE_THRESHOLD_CHARS = 6000

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    email = decode_token(credentials.credentials)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")
    db = get_db()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

async def get_document_text(doc_id: str, user_id: str) -> str:
    chunks = get_all_chunks(doc_id)
    if not chunks:
        raise HTTPException(status_code=404, detail="Document content not found")
    return "\n\n".join(chunks)

async def save_ai_result(db, document_id: str, user_id: str, feature: str, sub_type, result_dict: dict):
    """Upsert each AI feature's result into the DB so it can be shown again later
    instead of being lost when the user switches tabs/documents."""
    await db.ai_results.update_one(
        {"document_id": document_id, "user_id": user_id, "feature": feature, "sub_type": sub_type},
        {"$set": {
            "result": result_dict,
            "updated_at": datetime.utcnow()
        }},
        upsert=True
    )

NAME_PRESERVE_INSTRUCTION = (
    "IMPORTANT: Copy every person's name, organization name, and proper noun EXACTLY "
    "as spelled in the source text below. Do NOT auto-correct, normalize, or change "
    "spelling to a more common variant, even if it looks unusual. Format your response "
    "using markdown — use **bold** for key terms, headings, and important names.\n\n"
)

SUMMARY_PROMPTS = {
    "short": NAME_PRESERVE_INSTRUCTION + "Write a concise 2-3 sentence summary of the following:\n\n{text}\n\nCONCISE SUMMARY:",
    "detailed": NAME_PRESERVE_INSTRUCTION + "Write a comprehensive detailed summary covering all main points of the following:\n\n{text}\n\nDETAILED SUMMARY:",
    "bullets": NAME_PRESERVE_INSTRUCTION + "Summarize the following in clear, concise bullet points:\n\n{text}\n\nBULLET POINT SUMMARY:",
    "key_takeaways": NAME_PRESERVE_INSTRUCTION + "Extract the 5 most important key takeaways from the following:\n\n{text}\n\nKEY TAKEAWAYS:",
}

SUMMARY_COMBINE_PROMPTS = {
    "short": "Combine these partial summaries into one concise 2-3 sentence summary:\n\n{text}\n\nFINAL CONCISE SUMMARY:",
    "detailed": "Combine these partial summaries into one comprehensive detailed summary:\n\n{text}\n\nFINAL DETAILED SUMMARY:",
    "bullets": "Combine these partial summaries into one clear bullet point summary:\n\n{text}\n\nFINAL BULLET SUMMARY:",
    "key_takeaways": "Combine these partial summaries into the 5 most important key takeaways overall:\n\n{text}\n\nFINAL KEY TAKEAWAYS:",
}

@router.post("/summarize", response_model=SummaryResponse)
async def summarize_document(
    request: SummaryRequest,
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

    chunks = get_all_chunks(request.document_id)
    if not chunks:
        raise HTTPException(status_code=404, detail="Document content not found")

    full_text = "\n\n".join(chunks)
    docs = [Document(page_content=c) for c in chunks]

    summary_type = request.summary_type if request.summary_type in SUMMARY_PROMPTS else "short"
    map_prompt = ChatPromptTemplate.from_template(SUMMARY_PROMPTS[summary_type])
    combine_prompt = ChatPromptTemplate.from_template(SUMMARY_COMBINE_PROMPTS[summary_type])

    start_time = time.time()
    chain_type_used = "map_reduce" if (len(full_text) > MAP_REDUCE_THRESHOLD_CHARS and len(docs) > 1) else "stuff"

    if chain_type_used == "map_reduce":
        chain = load_summarize_chain(
            llm,
            chain_type="map_reduce",
            map_prompt=map_prompt,
            combine_prompt=combine_prompt,
        )
    else:
        chain = load_summarize_chain(
            llm,
            chain_type="stuff",
            prompt=map_prompt,
        )
    token_callback = TokenTrackingCallback()
    result = chain.invoke({"input_documents": docs}, config={"callbacks": [token_callback]})
    content = result["output_text"]
    duration_ms = round((time.time() - start_time) * 1000, 2)

    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$inc": {"total_ai_requests": 1}}
    )
    await log_ai_request(db, str(current_user["_id"]), "summarize", "llama-3.3-70b-versatile", duration_ms, token_callback.total_tokens)

    result_data = {
        "document_id": request.document_id,
        "summary_type": request.summary_type,
        "content": content.strip()
    }

    await save_ai_result(db, request.document_id, str(current_user["_id"]), "summarize", request.summary_type, result_data)

    return SummaryResponse(**result_data)

QUESTION_PROMPTS = {
    "faq": NAME_PRESERVE_INSTRUCTION + "Generate 5 frequently asked questions (FAQ) with answers based on this document.\n\nDOCUMENT:\n{text}",
    "interview": NAME_PRESERVE_INSTRUCTION + "Generate 5 interview questions based on the topics in this document.\n\nDOCUMENT:\n{text}",
    "quiz": NAME_PRESERVE_INSTRUCTION + "Generate 5 quiz questions with multiple choice answers based on this document.\n\nDOCUMENT:\n{text}",
}

@router.post("/questions", response_model=QuestionResponse)
async def generate_questions(
    request: QuestionRequest,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    doc = await db.documents.find_one({
        "_id": ObjectId(request.document_id),
        "user_id": str(current_user["_id"])
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    text = await get_document_text(request.document_id, str(current_user["_id"]))

    question_type = request.question_type if request.question_type in QUESTION_PROMPTS else "faq"
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert at generating questions from documents."),
        ("human", QUESTION_PROMPTS[question_type]),
    ])

    start_time = time.time()
    chain = prompt | llm
    result = chain.invoke({"text": text[:6000]})
    content = result.content
    # Strip stray markdown heading markers (LLM sometimes emits "####" mid-line
    # without a preceding newline, which then renders as literal hash symbols)
    content = re.sub(r'#{1,6}\s*', '', content)
    duration_ms = round((time.time() - start_time) * 1000, 2)

    tokens_used = None
    if hasattr(result, "usage_metadata") and result.usage_metadata:
        tokens_used = result.usage_metadata.get("total_tokens")

    questions = [q.strip() for q in content.split('\n') if q.strip() and len(q.strip()) > 10]

    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$inc": {"total_ai_requests": 1}}
    )
    await log_ai_request(db, str(current_user["_id"]), "questions", "llama-3.3-70b-versatile", duration_ms, tokens_used)

    result_data = {
        "document_id": request.document_id,
        "question_type": request.question_type,
        "questions": questions
    }

    await save_ai_result(db, request.document_id, str(current_user["_id"]), "questions", request.question_type, result_data)

    return QuestionResponse(**result_data)

COMPARISON_PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "You are an expert at comparing documents. Given the content of two documents, "
     "provide a clear, structured comparison covering: (1) key similarities, "
     "(2) key differences, (3) which document is more detailed/comprehensive on shared topics, "
     "and (4) a brief overall summary of how they relate. Use plain text with clear paragraph "
     "breaks, no markdown headers."
     + NAME_PRESERVE_INSTRUCTION),
    ("human", "DOCUMENT 1:\n{doc1}\n\nDOCUMENT 2:\n{doc2}\n\nComparison:"),
])

@router.post("/compare", response_model=ComparisonResponse)
async def compare_documents(
    request: ComparisonRequest,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    doc1 = await db.documents.find_one({"_id": ObjectId(request.document_id_1), "user_id": str(current_user["_id"])})
    doc2 = await db.documents.find_one({"_id": ObjectId(request.document_id_2), "user_id": str(current_user["_id"])})
    if not doc1 or not doc2:
        raise HTTPException(status_code=404, detail="One or both documents not found")
    if doc1["status"] != "ready" or doc2["status"] != "ready":
        raise HTTPException(status_code=400, detail="Both documents must be fully processed")

    text1 = await get_document_text(request.document_id_1, str(current_user["_id"]))
    text2 = await get_document_text(request.document_id_2, str(current_user["_id"]))

    start_time = time.time()
    chain = COMPARISON_PROMPT | llm
    result = chain.invoke({"doc1": text1[:4000], "doc2": text2[:4000]})
    content = re.sub(r'#{1,6}\s*', '', result.content)
    duration_ms = round((time.time() - start_time) * 1000, 2)

    await db.users.update_one({"_id": current_user["_id"]}, {"$inc": {"total_ai_requests": 1}})
    await log_ai_request(db, str(current_user["_id"]), "compare", "llama-3.3-70b-versatile", duration_ms)

    return ComparisonResponse(
        document_id_1=request.document_id_1,
        document_id_2=request.document_id_2,
        comparison=content.strip()
    )

TRANSLATION_PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "You are a professional document translator. Translate the given text into "
     "{target_language} accurately, preserving meaning and tone. "
     "CRITICAL: Preserve the exact structure of the source — keep section headings, "
     "titles, bullet points, numbered lists, and line breaks in the same places and "
     "the same format as the original. Only translate the actual text content; do "
     "not remove, merge, or reformat headings, bullets, or paragraph breaks. "
     "Return ONLY the translated text, no explanations, no extra notes."),
    ("human", "{text}"),
])

def chunk_text_for_translation(text: str, chunk_size: int = 4000) -> list:
    """Split text into chunks on paragraph boundaries where possible, so each
    chunk sent to the LLM stays coherent and translations combine cleanly."""
    paragraphs = text.split("\n\n")
    chunks = []
    current = ""
    for para in paragraphs:
        if len(current) + len(para) + 2 > chunk_size and current:
            chunks.append(current.strip())
            current = para
        else:
            current = (current + "\n\n" + para) if current else para
    if current.strip():
        chunks.append(current.strip())
    return chunks

@router.post("/translate", response_model=TranslationResponse)
async def translate_document(
    request: TranslationRequest,
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

    text = await get_document_text(request.document_id, str(current_user["_id"]))
    chunks = chunk_text_for_translation(text)

    start_time = time.time()
    chain = TRANSLATION_PROMPT | llm
    translated_parts = []
    successful_chunks = 0
    for chunk in chunks:
        try:
            result = chain.invoke({"target_language": request.target_language, "text": chunk})
            cleaned = re.sub(r'#{1,6}\s*', '', result.content)
            translated_parts.append(cleaned.strip())
            successful_chunks += 1
        except Exception:
            translated_parts.append(chunk)  # keep original text for this chunk if translation fails
    content = "\n\n".join(translated_parts)
    duration_ms = round((time.time() - start_time) * 1000, 2)

    await db.users.update_one({"_id": current_user["_id"]}, {"$inc": {"total_ai_requests": 1}})
    await log_ai_request(db, str(current_user["_id"]), "translate", "llama-3.3-70b-versatile", duration_ms)

    coverage_percent = round((successful_chunks / len(chunks)) * 100) if chunks else 0

    return TranslationResponse(
        document_id=request.document_id,
        target_language=request.target_language,
        translated_text=content.strip(),
        coverage_percent=coverage_percent,
        total_chunks=len(chunks),
        translated_chunks=successful_chunks
    )

@router.get("/sentiment/{document_id}", response_model=SentimentResponse)
async def analyze_sentiment(
    document_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    doc = await db.documents.find_one({
        "_id": ObjectId(document_id),
        "user_id": str(current_user["_id"])
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    text = await get_document_text(document_id, str(current_user["_id"]))

    start_time = time.time()
    overall = analyze_sentiment_overall(text)
    per_sentence = analyze_sentiment_per_sentence(text)
    duration_ms = round((time.time() - start_time) * 1000, 2)

    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$inc": {"total_ai_requests": 1}}
    )
    await log_ai_request(db, str(current_user["_id"]), "sentiment", "cardiffnlp-roberta", duration_ms)

    result_data = {"document_id": document_id, **overall, "per_sentence": per_sentence}

    await save_ai_result(db, document_id, str(current_user["_id"]), "sentiment", None, result_data)

    return SentimentResponse(**result_data)

NER_VERIFY_PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "You are an expert at validating and correcting Named Entity Recognition (NER) results. "
     "You will receive candidate entities extracted by an automated tool, grouped by category. "
     "Some entities may be miscategorized (e.g. a platform name listed as a person, an address "
     "fragment listed as a person, a location listed as an organization), incomplete, or not real "
     "entities at all (generic phrases, section headers, project titles). "
     "Your job is to MOVE entities to their correct category and REMOVE only entries that are "
     "clearly not real entities. "
     "IMPORTANT: Be thorough, not conservative — every genuinely valid entity from the candidates "
     "must appear in your output under the correct category. Do NOT drop, skip, or omit valid "
     "entities just to be cautious. It is better to keep a borderline entity than to lose a real one. "
     "If a category legitimately has zero valid entities after correction, return an empty array "
     "for it — but only do this when you are certain none of the candidates belong there. "
     + NAME_PRESERVE_INSTRUCTION +
     "Return ONLY valid JSON in this exact format with no explanation: "
     '{{"persons": [...], "organizations": [...], "locations": [...], "dates": [...]}}'),
    ("human", "Candidate entities extracted from the document:\n{candidates}\n\nCorrected JSON:"),
])

@router.get("/ner/{document_id}", response_model=NERResponse)
async def extract_entities(
    document_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    doc = await db.documents.find_one({
        "_id": ObjectId(document_id),
        "user_id": str(current_user["_id"])
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    text = await get_document_text(document_id, str(current_user["_id"]))

    start_time = time.time()
    entities = extract_entities_spacy(text)

    # Hybrid step: ask the LLM to verify/reclassify spaCy's candidate entities
    try:
        candidates_str = json.dumps({
            "persons": entities["persons"],
            "organizations": entities["organizations"],
            "locations": entities["locations"],
            "dates": entities["dates"],
        })
        verify_chain = NER_VERIFY_PROMPT | llm
        verify_result = verify_chain.invoke({"candidates": candidates_str})
        json_match = re.search(r'\{.*\}', verify_result.content, re.DOTALL)
        if json_match:
            corrected = json.loads(json_match.group())
            entities["persons"] = corrected.get("persons", entities["persons"])
            entities["organizations"] = corrected.get("organizations", entities["organizations"])
            entities["locations"] = corrected.get("locations", entities["locations"])
            entities["dates"] = corrected.get("dates", entities["dates"])
    except Exception:
        pass  # fall back to spaCy-only results if LLM verification fails

    duration_ms = round((time.time() - start_time) * 1000, 2)

    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$inc": {"total_ai_requests": 1}}
    )
    await log_ai_request(db, str(current_user["_id"]), "ner", "spacy-en_core_web_sm", duration_ms)

    result_data = {"document_id": document_id, **entities}

    await save_ai_result(db, document_id, str(current_user["_id"]), "ner", None, result_data)

    return NERResponse(**result_data)

@router.get("/export-pdf/{document_id}")
async def export_results_pdf(
    document_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    doc = await db.documents.find_one({
        "_id": ObjectId(document_id),
        "user_id": str(current_user["_id"])
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    cursor = db.ai_results.find({
        "document_id": document_id,
        "user_id": str(current_user["_id"])
    })
    items = await cursor.to_list(length=100)

    if not items:
        raise HTTPException(status_code=404, detail="No AI results found for this document yet")

    def md_to_pdf_text(text: str) -> str:
        if not text:
            return ""
        # Escape XML special chars first (ReportLab Paragraph parses simple XML/HTML)
        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        # Strip stray heading markers
        text = re.sub(r'#{1,6}\s*', '', text)
        # Convert **bold** -> <b>bold</b>
        text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
        # Convert remaining single * bullets to a simple dash
        text = re.sub(r'(?:^|\n)\*\s+', '\n- ', text)
        # Convert newlines to line breaks for Paragraph rendering
        text = text.replace("\n", "<br/>")
        return text.strip()

    buffer = _io.BytesIO()
    pdf = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.75*inch, bottomMargin=0.75*inch)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('CustomTitle', parent=styles['Title'], fontSize=18, spaceAfter=12)
    heading_style = ParagraphStyle('CustomHeading', parent=styles['Heading2'], spaceBefore=16, spaceAfter=8)
    body_style = ParagraphStyle('CustomBody', parent=styles['BodyText'], spaceAfter=10, leading=16)

    elements = [
        Paragraph(f"AI Analysis Report: {doc['original_filename']}", title_style),
        Spacer(1, 0.1*inch),
    ]

    feature_titles = {
        "summarize": "Summary",
        "questions": "Generated Questions",
        "sentiment": "Sentiment Analysis",
        "ner": "Named Entities",
    }

    for item in items:
        feature = item.get("feature")
        result = item.get("result", {})
        elements.append(Paragraph(feature_titles.get(feature, feature.title()), heading_style))

        if feature == "summarize":
            elements.append(Paragraph(md_to_pdf_text(result.get("content", "")), body_style))
        elif feature == "questions":
            for q in result.get("questions", []):
                cleaned = md_to_pdf_text(q)
                if cleaned:
                    elements.append(Paragraph(cleaned, body_style))
        elif feature == "sentiment":
            elements.append(Paragraph(
                f"Overall sentiment: <b>{result.get('sentiment', 'N/A')}</b> "
                f"(confidence: {round(result.get('confidence', 0) * 100, 1)}%)",
                body_style
            ))
        elif feature == "ner":
            for label, key in [("Persons", "persons"), ("Organizations", "organizations"),
                                ("Locations", "locations"), ("Dates", "dates"), ("Emails", "emails")]:
                values = result.get(key, [])
                if values:
                    safe_values = [v.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;") for v in values]
                    elements.append(Paragraph(f"<b>{label}:</b> {', '.join(safe_values)}", body_style))

    pdf.build(elements)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=ai_report_{document_id}.pdf"}
    )

@router.get("/results/{document_id}")
async def get_cached_results(
    document_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Return all saved AI results (summarize/questions/sentiment/ner) for a document,
    so the frontend can restore them instead of showing a blank state on revisit."""
    db = get_db()
    cursor = db.ai_results.find({
        "document_id": document_id,
        "user_id": str(current_user["_id"])
    })
    items = await cursor.to_list(length=100)
    for item in items:
        item["id"] = str(item["_id"])
        del item["_id"]
    return {"results": items}
