from pydantic import BaseModel
from typing import List, Optional

class SummaryRequest(BaseModel):
    document_id: str
    summary_type: str = "short"  # short, detailed, bullets, key_takeaways

class SummaryResponse(BaseModel):
    document_id: str
    summary_type: str
    content: str

class QuestionRequest(BaseModel):
    document_id: str
    question_type: str = "faq"  # faq, interview, quiz

class QuestionResponse(BaseModel):
    document_id: str
    question_type: str
    questions: List[str]

class SentenceSentiment(BaseModel):
    sentence: str
    sentiment: str
    confidence: float

class SentimentResponse(BaseModel):
    document_id: str
    sentiment: str
    confidence: float
    positive_score: float
    negative_score: float
    neutral_score: float
    per_sentence: List[SentenceSentiment] = []

class TranslationRequest(BaseModel):
    document_id: str
    target_language: str

class TranslationResponse(BaseModel):
    document_id: str
    target_language: str
    translated_text: str
    coverage_percent: int
    total_chunks: int
    translated_chunks: int

class ComparisonRequest(BaseModel):
    document_id_1: str
    document_id_2: str

class ComparisonResponse(BaseModel):
    document_id_1: str
    document_id_2: str
    comparison: str

class NERResponse(BaseModel):
    document_id: str
    persons: List[str]
    organizations: List[str]
    locations: List[str]
    dates: List[str]
    emails: List[str]
    phones: List[str]
