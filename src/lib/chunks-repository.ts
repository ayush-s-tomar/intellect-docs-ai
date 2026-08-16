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

  if (chunks && chunks.length > 0) {
    return chunks as ChunkResult[]
  }

  logger.warn('chunks-repository', 'Hybrid search returned no results, falling back', { sessionId, docIds })
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
  return chunks.map(c => c.content).join('\n\n') || 'No context found.'
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
