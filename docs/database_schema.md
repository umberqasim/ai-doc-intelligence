# Database Schema Documentation

MongoDB (Atlas) is used as the primary database. Below are all collections used by the application, their fields, and the indexes created on them.

---

## `users`

Stores registered user accounts.

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Primary key |
| `full_name` | string | User's full name |
| `email` | string | Unique, used for login |
| `hashed_password` | string | Bcrypt-hashed password |
| `role` | string | `"user"` or `"admin"` |
| `is_active` | boolean | Account active/disabled status |
| `created_at` | datetime | Account creation timestamp |
| `total_documents` | int | Running count of uploaded documents |
| `total_conversations` | int | Running count of chat conversations |
| `total_ai_requests` | int | Running count of AI feature calls |

**Indexes:** `email` (unique)

---

## `documents`

Stores metadata for each uploaded document. The actual extracted text/embeddings live in ChromaDB, keyed by document ID.

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Primary key |
| `filename` | string | Stored filename (UUID-based, on disk) |
| `original_filename` | string | User-facing filename (editable via rename) |
| `file_type` | string | `pdf`, `docx`, `txt`, or `csv` |
| `file_size` | int | Size in bytes |
| `file_path` | string | Path on disk (`uploads/`) |
| `status` | string | `pending`, `processing`, `ready`, or `error` |
| `chunk_count` | int | Number of text chunks stored in ChromaDB |
| `user_id` | string | Owning user's `_id` (as string) |
| `category` | string \| null | User-assigned category |
| `text_preview` | string | First ~500 characters of extracted text |
| `error` | string | Populated only if `status == "error"` |
| `created_at` | datetime | Upload timestamp |

**Indexes:** `user_id`, `created_at`, compound `(user_id, status)`

---

## `conversations`

Stores chat history — one document per user question + AI answer pair.

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Primary key |
| `document_id` | string | Related document's `_id` |
| `user_id` | string | Owning user's `_id` |
| `messages` | array | `[{role: "user"/"assistant", content, timestamp}]` |
| `created_at` | datetime | Conversation timestamp |

**Indexes:** `user_id`, `document_id`, compound `(document_id, user_id, created_at desc)`

---

## `refresh_tokens`

Stores active refresh tokens for JWT rotation.

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Primary key |
| `token` | string | Random URL-safe token (unique) |
| `user_email` | string | Associated user's email |
| `expires_at` | datetime | Expiry timestamp |
| `created_at` | datetime | Issued timestamp |

**Indexes:** `token` (unique), `expires_at` (TTL index — MongoDB auto-deletes expired tokens)

---

## `ai_results`

Caches the last generated result per AI feature per document, so the frontend can restore previous results without re-running the AI pipeline.

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Primary key |
| `document_id` | string | Related document's `_id` |
| `user_id` | string | Owning user's `_id` |
| `feature` | string | `summarize`, `questions`, `sentiment`, or `ner` |
| `sub_type` | string \| null | e.g. summary type (`short`/`detailed`) or question type (`faq`/`quiz`) |
| `result` | object | The full result payload for that feature |
| `updated_at` | datetime | Last generated timestamp |

**Indexes:** compound `(document_id, user_id, feature, sub_type)` (upsert key)

---

## `ai_logs`

Tracks every AI feature invocation for the analytics dashboard (response time, token usage, model performance).

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Primary key |
| `user_id` | string | Owning user's `_id` |
| `feature` | string | `chat`, `chat_stream`, `summarize`, `questions`, `sentiment`, `ner`, `compare`, `translate` |
| `model` | string | Model identifier used (e.g. `llama-3.3-70b-versatile`, `cardiffnlp-roberta`, `spacy-en_core_web_sm`) |
| `duration_ms` | float | Request duration in milliseconds |
| `tokens_used` | int \| null | Token count, where available from the LLM provider |
| `status` | string | `success` (default) |
| `created_at` | datetime | Timestamp |

**Indexes:** `user_id`, compound `(user_id, feature)`

---

## External Store: ChromaDB (Vector Database)

Not MongoDB — a separate persistent vector store (`chroma_db/` on disk). One **collection per document**, named `doc_{document_id}`.

Each collection stores:
- `embeddings` — vector embeddings (384-dim, from `all-MiniLM-L6-v2`)
- `documents` — the raw text chunk
- `metadatas` — `{doc_id, user_id, chunk_index}`
- `ids` — `{doc_id}_chunk_{index}`

**Index config:** HNSW with cosine distance, tuned parameters (`construction_ef=200`, `search_ef=100`, `M=16`) for a balance of search speed and accuracy.

---

## Entity Relationship Overview

```
users (1) ──< (many) documents
users (1) ──< (many) conversations
users (1) ──< (many) refresh_tokens
users (1) ──< (many) ai_logs

documents (1) ──< (many) conversations
documents (1) ──< (many) ai_results
documents (1) ──1:1── ChromaDB collection (doc_{document_id})
```
