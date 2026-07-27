# Fix SQLite version for ChromaDB
__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

import fitz
import docx
import pandas as pd
from typing import List
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
import chromadb

print("Loading embedding model...")
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
print("✅ Embedding model loaded!")

chroma_client = chromadb.PersistentClient(path="./chroma_db")

def extract_text(file_path: str, file_type: str) -> str:
    text = ""
    if file_type == "pdf":
        doc = fitz.open(file_path)
        for page in doc:
            text += page.get_text()
        doc.close()
    elif file_type == "docx":
        doc = docx.Document(file_path)
        for para in doc.paragraphs:
            text += para.text + "\n"
    elif file_type == "txt":
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            text = f.read()
    elif file_type == "csv":
        df = pd.read_csv(file_path)
        text = df.to_string()
    return text.strip()

def split_text(text: str) -> List[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len,
        separators=["\n\n", "\n", ". ", "! ", "? ", " ", ""]
    )
    return splitter.split_text(text)

def store_embeddings(doc_id: str, chunks: List[str], user_id: str):
    collection_name = f"doc_{doc_id}"
    try:
        collection = chroma_client.get_collection(collection_name)
    except:
        # IMPORTANT: explicitly use cosine distance. ChromaDB's default is
        # squared L2 distance, which does NOT translate to "1 - dist" being
        # a valid 0-1 relevance score (it can exceed 1, so 1 - dist goes
        # negative and always clamps to 0% on the frontend).
        collection = chroma_client.create_collection(
            collection_name,
            metadata={
                "hnsw:space": "cosine",
                "hnsw:construction_ef": 200,  # higher = better index quality at build time
                "hnsw:search_ef": 100,        # higher = more accurate search at query time
                "hnsw:M": 16                  # graph connectivity, balances speed/accuracy
            }
        )

    embeddings = embedding_model.encode(chunks).tolist()
    ids = [f"{doc_id}_chunk_{i}" for i in range(len(chunks))]
    metadatas = [{"doc_id": doc_id, "user_id": user_id, "chunk_index": i} for i in range(len(chunks))]

    collection.add(
        embeddings=embeddings,
        documents=chunks,
        ids=ids,
        metadatas=metadatas
    )
    return len(chunks)

def search_similar_chunks(doc_id: str, query: str, top_k: int = 5) -> List[str]:
    try:
        collection = chroma_client.get_collection(f"doc_{doc_id}")
        query_embedding = embedding_model.encode([query]).tolist()
        results = collection.query(
            query_embeddings=query_embedding,
            n_results=min(top_k, collection.count())
        )
        return results['documents'][0] if results['documents'] else []
    except:
        return []

def delete_document_embeddings(doc_id: str):
    try:
        chroma_client.delete_collection(f"doc_{doc_id}")
    except:
        pass
# ---- LangChain integration ----
from langchain_core.embeddings import Embeddings
from langchain_chroma import Chroma

class STEmbeddingsWrapper(Embeddings):
    """Wraps our existing SentenceTransformer model so LangChain can use it."""
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return embedding_model.encode(texts).tolist()

    def embed_query(self, text: str) -> List[float]:
        return embedding_model.encode([text]).tolist()[0]

def get_langchain_retriever(doc_id: str, k: int = 5):
    collection_name = f"doc_{doc_id}"
    vectorstore = Chroma(
        client=chroma_client,
        collection_name=collection_name,
        embedding_function=STEmbeddingsWrapper(),
    )
    return vectorstore.as_retriever(search_kwargs={"k": k})


def get_all_chunks(doc_id: str) -> List[str]:
    """Fetch ALL stored chunks for a document (no similarity search) —
    used by NER/Sentiment which need full document context, not top-k matches."""
    try:
        collection = chroma_client.get_collection(f"doc_{doc_id}")
        result = collection.get()
        return result['documents'] if result and result.get('documents') else []
    except:
        return []
