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

// Converts each chunk's relevance into a percentage that reflects its
// share of the total relevance across the returned set, so displayed
// match percentages sum to ~100% (small rounding drift of +/-1% from
// Math.round is expected and not a bug).
//
// Uses rrf_score, not similarity, as the normalization basis. In hybrid
// search results, a chunk retrieved purely via full-text match (no
// vector-search hit) has similarity coalesced to 0 in the SQL RPC even
// though it has a real, meaningful rrf_score — normalizing on similarity
// would silently zero out exactly the keyword/proper-noun matches hybrid
// search exists to surface. similarity is kept as a fallback for
// non-hybrid callers (e.g. searchChunksVectorOnly / match_chunks), which
// don't return rrf_score at all.
export function chunksToSources(chunks: ChunkResult[]) {
  const scoreOf = (c: ChunkResult) =>
    typeof c.rrf_score === 'number' && !isNaN(c.rrf_score) && c.rrf_score > 0
      ? c.rrf_score
      : c.similarity

  const validScores = chunks
    .map(scoreOf)
    .filter((s): s is number => typeof s === 'number' && !isNaN(s) && s > 0)

  const totalScore = validScores.reduce((sum, s) => sum + s, 0)

  return chunks.map(c => {
    const score = scoreOf(c)
    return {
      content: c.content,
      document_id: c.document_id,
      similarity:
        typeof score === 'number' && !isNaN(score) && score > 0 && totalScore > 0
          ? Math.round((score / totalScore) * 100)
          : null,
    }
  })
}