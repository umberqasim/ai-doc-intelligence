import re
import spacy
from transformers import pipeline

print("Loading spaCy model...")
nlp_spacy = spacy.load("en_core_web_sm")
print("✅ spaCy model loaded!")

print("Loading HuggingFace sentiment model (cardiffnlp)...")
sentiment_pipeline = pipeline(
    "sentiment-analysis",
    model="cardiffnlp/twitter-roberta-base-sentiment-latest"
)
print("✅ Sentiment model loaded!")

PHONE_REGEX = re.compile(
    r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}'
)
EMAIL_REGEX = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')

LABEL_MAP = {
    "positive": "positive",
    "negative": "negative",
    "neutral": "neutral",
    "LABEL_0": "negative",
    "LABEL_1": "neutral",
    "LABEL_2": "positive",
}

def normalize_label(label: str) -> str:
    return LABEL_MAP.get(label, label.lower())

TECH_TERM_BLACKLIST = {
    "ai", "sql", "html", "css", "php", "docker", "git", "rag", "nlp", "ui",
    "crud", "ieee", "hci", "ml", "llm", "api", "rest", "json", "xml",
    "cloud computing", "deep learning", "machine learning", "detail",
    "time management", "team collaboration", "admin", "coursework",
    "developed", "completing", "collected", "implemented", "secured",
    "trained", "assessed", "designed", "built", "created", "managed"
}

def clean_entity_text(raw: str) -> str:
    text = raw.strip()
    text = text.lstrip("•-*").strip()
    text = text.split("\n")[0].strip()
    return text

GENERIC_ORG_SUFFIXES = (
    "model", "activities", "process", "planning", "analysis", "assessment",
    "engineering", "framework", "estimation", "breakdown", "collection",
    "measurement", "improvement", "interaction", "management", "methods",
    "practices", "processes", "levels", "tasks", "quality", "resource",
    "relation", "focus", "statement", "outcome", "approach", "title",
    "overview", "description", "methodology", "conclusion", "requirements",
    "specification", "specifications", "objective", "objectives", "scope",
    "background", "abstract", "summary", "introduction", "proposal",
    "system", "systems", "diagram", "workflow", "structure"
)

import re as _re

CODE_SYNTAX_PATTERN = _re.compile(r'[=(){}\[\]<>+\-*/^_]')
SINGLE_LOWERCASE_WORD_PATTERN = _re.compile(r'^[a-z]+$')

def is_valid_entity(text: str, label: str = None) -> bool:
    # Keep only minimal, structural filtering here — clearly broken fragments,
    # not judgment calls about what counts as a "real" entity. The LLM
    # verification step (in routes.py) handles categorization/quality
    # decisions with full context, since over-filtering here would remove
    # valid candidates before the LLM even sees them.
    if not text or len(text) < 2:
        return False
    if len(text) > 60:
        return False
    if text.startswith("•"):
        return False
    # Reject code/formula fragments (contains =, (), {}, [], math operators)
    if CODE_SYNTAX_PATTERN.search(text):
        return False
    # Reject unbalanced parentheses/brackets left over from cleaning
    if text.count("(") != text.count(")"):
        return False
    # Reject single lowercase words (likely variable names, not real entities)
    if label in ("PERSON", "ORG") and SINGLE_LOWERCASE_WORD_PATTERN.match(text) and len(text.split()) == 1:
        return False
    return True

def extract_entities_spacy(text: str) -> dict:
    doc = nlp_spacy(text[:100000])
    persons, orgs, locations, dates = set(), set(), set(), set()
    for ent in doc.ents:
        cleaned = clean_entity_text(ent.text)
        if not is_valid_entity(cleaned, ent.label_):
            continue
        if ent.label_ == "PERSON":
            persons.add(cleaned)
        elif ent.label_ == "ORG":
            orgs.add(cleaned)
        elif ent.label_ in ("GPE", "LOC"):
            locations.add(cleaned)
        elif ent.label_ == "DATE":
            dates.add(cleaned)
    emails = set(EMAIL_REGEX.findall(text))
    phones = set(m.strip() for m in PHONE_REGEX.findall(text) if len(m.strip()) >= 7)
    return {
        "persons": sorted(persons),
        "organizations": sorted(orgs),
        "locations": sorted(locations),
        "dates": sorted(dates),
        "emails": sorted(emails),
        "phones": sorted(phones),
    }

def analyze_sentiment_overall(text: str) -> dict:
    result = sentiment_pipeline(text[:512])[0]
    label = normalize_label(result["label"])
    confidence = round(result["score"], 4)
    scores = {"positive": 0.0, "negative": 0.0, "neutral": 0.0}
    scores[label] = confidence
    remaining = round((1 - confidence) / 2, 4)
    for k in scores:
        if k != label:
            scores[k] = remaining
    return {
        "sentiment": label,
        "confidence": confidence,
        "positive_score": scores["positive"],
        "negative_score": scores["negative"],
        "neutral_score": scores["neutral"],
    }

def analyze_sentiment_per_sentence(text: str, max_sentences: int = 30) -> list:
    doc = nlp_spacy(text[:100000])
    sentences = [sent.text.strip() for sent in doc.sents if len(sent.text.strip()) > 5][:max_sentences]
    results = []
    for sent in sentences:
        r = sentiment_pipeline(sent[:512])[0]
        results.append({
            "sentence": sent,
            "sentiment": normalize_label(r["label"]),
            "confidence": round(r["score"], 4)
        })
    return results
