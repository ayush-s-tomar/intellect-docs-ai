-- AskMyDocs — Database Schema
-- Consolidated from migration history (Supabase SQL editor) for reference.
-- Run top-to-bottom on a fresh Supabase project to recreate the schema.

-- 1. Enable pgvector for similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Core tables (documents + chunks) are assumed to pre-exist with at
--    minimum: documents(id, name, created_at), chunks(id, document_id, content)

-- 3. Document metadata
ALTER TABLE documents ADD COLUMN IF NOT EXISTS summary TEXT;

-- 4. Session-scoped multi-user isolation (see useSessionId.ts)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_session_id ON documents(session_id);
CREATE INDEX IF NOT EXISTS idx_chunks_session_id ON chunks(session_id);

-- 5. Embedding storage — 384 dimensions (Cohere embed-english-light-v3.0)
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding_v2 vector(384);

-- 6. Similarity search RPC used by /api/chat and /api/eval
--
-- Filters out zero-vectors (chunks whose embedding call failed and fell
-- back to a zero array in embeddings.ts) using pgvector's L2 distance
-- against the zero vector, instead of a hardcoded 384-element string
-- literal — same check, far less fragile and dimension-agnostic.
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(384),
  match_count int,
  filter_session_id text,
  filter_doc_ids bigint[]
)
RETURNS TABLE (
  content text,
  document_id bigint,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    content,
    document_id,
    1 - (embedding_v2 <=> query_embedding) AS similarity
  FROM chunks
  WHERE
    session_id = filter_session_id
    AND document_id = ANY(filter_doc_ids)
    AND embedding_v2 IS NOT NULL
    AND embedding_v2 <-> array_fill(0, ARRAY[384])::vector != 0
  ORDER BY embedding_v2 <=> query_embedding
  LIMIT match_count;
$$;