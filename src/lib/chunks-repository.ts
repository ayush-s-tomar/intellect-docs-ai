import { supabaseAdmin } from '@/lib/supabase-admin'
import { logger } from '@/lib/logger'
import { RETRIEVAL } from '@/lib/config'

export interface ChunkResult {
  content: string
  document_id: number
  similarity?: number | null
  rrf_score?: number
}

interface SearchParams {
  queryText: string
  queryEmbedding: number[]
  matchCount: number
  sessionId: string
  docIds: number[]
}

export async function searchChunksHybrid(params: SearchParams): Promise<ChunkResult[]> {
  const { queryText, queryEmbedding, matchCount, sessionId, docIds } = params

  const { data, error } = await supabaseAdmin.rpc('hybrid_search_chunks', {
    query_text: queryText,
    query_embedding: queryEmbedding,
    match_count: matchCount,
    filter_session_id: sessionId,
    filter_doc_ids: docIds,
    rrf_k: RETRIEVAL.RRF_K,
  })

  if (error) {
    logger.error('chunks-repository', 'Hybrid search RPC failed', { error: error.message, sessionId })
  }

  // Drop rows with empty content so blanks never leak into the LLM context.
  const usable = ((data ?? []) as ChunkResult[]).filter(c => c.content && c.content.trim().length > 0)
  if (usable.length > 0) return usable

  // Degraded path (RPC failure, or no rows at all): return the first N chunks
  // of the selected documents, unranked. Logged so it is visible, never silent.
  logger.warn('chunks-repository', 'Hybrid search returned no usable content, falling back', {
    sessionId,
    docIds,
    rawResultCount: data?.length ?? 0,
  })
  return fallbackFetchChunks(sessionId, docIds, matchCount)
}

export async function searchChunksVectorOnly(params: Omit<SearchParams, 'queryText'>): Promise<ChunkResult[]> {
  const { queryEmbedding, matchCount, sessionId, docIds } = params

  const { data: chunks, error } = await supabaseAdmin.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    filter_session_id: sessionId,
    filter_doc_ids: docIds,
  })

  if (error) {
    logger.error('chunks-repository', 'Vector search RPC failed', { error: error.message, sessionId })
  }

  return (chunks || []) as ChunkResult[]
}

async function fallbackFetchChunks(
  sessionId: string,
  docIds: number[],
  limit: number
): Promise<ChunkResult[]> {
  const { data, error } = await supabaseAdmin
    .from('chunks')
    .select('content, document_id')
    .in('document_id', docIds.length ? docIds : [-1])
    .eq('session_id', sessionId)
    .limit(limit)

  if (error) {
    logger.error('chunks-repository', 'Fallback fetch failed', { error: error.message, sessionId })
    return []
  }

  return (data || []) as ChunkResult[]
}

// Each excerpt is labelled [Chunk N] in the same order the UI lists its
// sources ("Chunk 1" ... "Chunk N"), so when the model cites "(Chunk 2)" the
// reader can open that exact card. Order must stay aligned with chunksToSources.
export function chunksToContext(chunks: ChunkResult[]): string {
  const labelled = chunks
    .map((c, i) => `[Chunk ${i + 1}]\n${(c.content ?? '').trim()}`)
    .join('\n\n')
  if (!labelled.replace(/\[Chunk \d+\]/g, '').trim()) return 'No context found.'
  return `Excerpts below are labelled [Chunk N]. When you use one, cite it as (Chunk N).\n\n${labelled}`
}

// The percentage shown next to each source is the chunk's real cosine
// similarity to the query (pgvector, 0-100). It is NOT the RRF score: RRF
// scores are rank-based and nearly identical across the top results, so they
// say how results were ordered, not how close each one is. Chunks with no
// embedding similarity (e.g. the unranked fallback path) show null.
export function chunksToSources(chunks: ChunkResult[]) {
  return chunks.map(c => ({
    content: c.content,
    document_id: c.document_id,
    similarity:
      typeof c.similarity === 'number' && Number.isFinite(c.similarity) && c.similarity > 0
        ? Math.min(100, Math.round(c.similarity * 100))
        : null,
  }))
}