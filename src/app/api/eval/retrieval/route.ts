import { NextRequest } from 'next/server'
import { evalRequestSchema, formatZodError } from '@/lib/validation'
import { apiSuccess, apiError, handleApiError } from '@/lib/api-response'
import { embedQuery } from '@/lib/embeddings'
import { searchChunksHybrid } from '@/lib/chunks-repository'
import { evalRatelimit, safeLimit, getClientIp } from '@/lib/ratelimit'
import { RETRIEVAL } from '@/lib/config'
import { HANDBOOK_CASES, containsFact, summarizeRetrieval } from '@/lib/retrievalEval'

// Uses only Cohere and Supabase, no LLM, so it costs no Groq tokens.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json()

    const parseResult = evalRequestSchema.safeParse(rawBody)
    if (!parseResult.success) {
      return apiError('VALIDATION_ERROR', formatZodError(parseResult.error))
    }
    const { session_id, document_id } = parseResult.data

    const docId = parseInt(document_id, 10)
    if (isNaN(docId)) {
      return apiError('VALIDATION_ERROR', 'document_id must be a valid number')
    }

    const { success: allowed } = await safeLimit(evalRatelimit, getClientIp(req))
    if (!allowed) {
      return apiError('RATE_LIMITED', 'Eval limit reached. Please try again later.')
    }

    const items: { question: string; fact: string; rank: number | null }[] = []

    for (const c of HANDBOOK_CASES) {
      const queryEmbedding = await embedQuery(c.question)
      const chunks = await searchChunksHybrid({
        queryText: c.question,
        queryEmbedding,
        matchCount: RETRIEVAL.MATCH_COUNT,
        sessionId: session_id,
        docIds: [docId],
      })
      const idx = chunks.findIndex(ch => containsFact(ch.content, c.fact))
      items.push({ question: c.question, fact: c.fact, rank: idx === -1 ? null : idx + 1 })
    }

    return apiSuccess({ summary: summarizeRetrieval(items.map(i => i.rank)), items })
  } catch (err) {
    return handleApiError(err, 'eval.retrieval')
  }
}