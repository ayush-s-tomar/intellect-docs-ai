-- AskMyDocs — Database Schema
-- Consolidated from migration history (Supabase SQL editor) for reference.
-- Run top-to-bottom on a fresh Supabase project to recreate the schema.
-- This file is idempotent — safe to re-run on an existing database.

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

-- 6. Similarity search RPC used by /api/chat and /api/eval (legacy — kept
-- for backward compatibility until Day 3 switches callers to the hybrid
-- function below; safe to drop once nothing references it).
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

-- ============================================================
-- 7. HYBRID SEARCH (NEW — Day 1)
-- ============================================================
--
-- Pure vector search misses exact keyword / name / number matches
-- (classic dense-retrieval failure mode — e.g. a query for "Q3 2024"
-- or a specific proper noun can rank poorly on cosine similarity
-- alone even when the literal term is present in a chunk).
--
-- This adds full-text search alongside the existing vector search
-- and fuses the two ranked lists with Reciprocal Rank Fusion (RRF),
-- a standard, tuning-free way to combine heterogeneous rankers:
--
--   RRF_score(doc) = Σ  1 / (k + rank_i(doc))
--
-- across each ranking method i, with k=60 (the standard constant from
-- the original RRF paper — large enough that no single top rank
-- dominates, small enough that rank position still matters).

-- 7a. Full-text search column + index.
-- GENERATED ALWAYS ... STORED keeps this in sync with `content`
-- automatically — no trigger to maintain, no risk of drift.
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS idx_chunks_content_tsv
  ON chunks USING GIN (content_tsv);

-- 7b. Hybrid search RPC — replaces match_chunks as the retrieval path
-- once Day 3 updates /api/chat and /api/eval to call this instead.
CREATE OR REPLACE FUNCTION hybrid_search_chunks(
  query_text text,
  query_embedding vector(384),
  match_count int,
  filter_session_id text,
  filter_doc_ids bigint[],
  rrf_k int DEFAULT 60
)
RETURNS TABLE (
  content text,
  document_id bigint,
  similarity float,
  rrf_score float
)
LANGUAGE sql STABLE
AS $$
  WITH vector_ranked AS (
    SELECT
      id,
      content,
      document_id,
      1 - (embedding_v2 <=> query_embedding) AS similarity,
      ROW_NUMBER() OVER (ORDER BY embedding_v2 <=> query_embedding) AS rnk
    FROM chunks
    WHERE
      session_id = filter_session_id
      AND document_id = ANY(filter_doc_ids)
      AND embedding_v2 IS NOT NULL
      AND embedding_v2 <-> array_fill(0, ARRAY[384])::vector != 0
    ORDER BY embedding_v2 <=> query_embedding
    LIMIT LEAST(match_count * 4, 40)
  ),
  text_ranked AS (
    SELECT
      id,
      content,
      document_id,
      ts_rank(content_tsv, websearch_to_tsquery('english', query_text)) AS text_score,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank(content_tsv, websearch_to_tsquery('english', query_text)) DESC
      ) AS rnk
    FROM chunks
    WHERE
      session_id = filter_session_id
      AND document_id = ANY(filter_doc_ids)
      AND content_tsv @@ websearch_to_tsquery('english', query_text)
    ORDER BY text_score DESC
    LIMIT LEAST(match_count * 4, 40)
  ),
  fused AS (
    SELECT
      COALESCE(v.id, t.id) AS id,
      COALESCE(v.content, t.content) AS content,
      COALESCE(v.document_id, t.document_id) AS document_id,
      COALESCE(v.similarity, 0) AS similarity,
      (COALESCE(1.0 / (rrf_k + v.rnk), 0) + COALESCE(1.0 / (rrf_k + t.rnk), 0)) AS rrf_score
    FROM vector_ranked v
    FULL OUTER JOIN text_ranked t ON v.id = t.id
  )
  SELECT content, document_id, similarity, rrf_score
  FROM fused
  ORDER BY rrf_score DESC
  LIMIT match_count;
$$;