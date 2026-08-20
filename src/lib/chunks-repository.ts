import { supabaseAdmin } from '@/lib/supabase-admin'
import { logger } from '@/lib/logger'

export interface ChunkResult {
  content: string
  document_id: number
  similarity?: number
  rrf_score?: number
}

interface SearchParams {
  queryText: string
  queryEmbedding: number[]
  matchCount: number
  sessionId: string
  docIds: number[]
}

// A chunk is only usable if it has non-empty content. The hybrid RPC's
// FULL OUTER JOIN can produce rows where content is null/empty for edge
// cases (e.g. a text-search-only match whose vector leg didn't populate
// content correctly). Array length alone isn't a reliable "did retrieval
// work" signal — we need to check the content itself.
function hasUsableContent(chunks: ChunkResult[] | null): chunks is ChunkResult[] {
  return !!chunks && chunks.some(c => c.content && c.content.trim().length > 0)
}

export async function searchChunksHybrid(params: SearchParams): Promise<ChunkResult[]> {
  const { queryText, queryEmbedding, matchCount, sessionId, docIds } = params

  const { data: chunks, error } = await supabaseAdmin.rpc('hybrid_search_chunks', {
    query_text: queryText,
    query_embedding: queryEmbedding,
    match_count: matchCount,
    filter_session_id: sessionId,
    filter_doc_ids: docIds,
  })

  if (error) {
    logger.error('chunks-repository', 'Hybrid search RPC failed', { error: error.message, sessionId })
  }

  // TEMP DEBUG — remove after diagnosing
  logger.warn('chunks-repository', 'DEBUG hybrid search result', {
    queryText,
    rawCount: chunks?.length ?? 0,
    sample: chunks?.[0] ?? null,
  })

  if (hasUsableContent(chunks)) {
    // Drop any individual rows with empty content rather than passing
    // them through — a partially-empty result set shouldn't leak blanks
    // into the context sent to the LLM.
    const usable = (chunks as ChunkResult[]).filter(c => c.content && c.content.trim().length > 0)
    return usable
  }

  logger.warn('chunks-repository', 'Hybrid search returned no usable content, falling back', {
    sessionId,
    docIds,
    rawResultCount: chunks?.length ?? 0,
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

export function chunksToContext(chunks: ChunkResult[]): string {
  const joined = chunks.map(c => c.content).filter(Boolean).join('\n\n')
  return joined.trim() || 'No context found.'
}

export function chunksToSources(chunks: ChunkResult[]) {
  return chunks.map(c => ({
    content: c.content,
    document_id: c.document_id,
    similarity: (c.similarity && !isNaN(c.similarity) && c.similarity > 0)
      ? Math.round(c.similarity * 100)
      : null,
  }))
}