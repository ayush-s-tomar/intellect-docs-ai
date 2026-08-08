import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Groq from 'groq-sdk'
import { embedQuery } from '@/lib/embeddings'
import { chatRatelimit } from '@/lib/ratelimit'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// How many prior turns (user+assistant pairs) to carry into context.
// Bounded so token usage / latency stay predictable on long sessions —
// older turns fall off rather than growing the prompt unboundedly.
const MAX_HISTORY_MESSAGES = 6

interface ChunkRow {
  content: string
  document_id: number
  similarity?: number
  rrf_score?: number
}

interface IncomingMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: NextRequest) {
  try {
    const { messages, selectedDocIds, session_id } = await req.json()
    const userQuery = messages[messages.length - 1].content

    const ip = req.headers.get('x-forwarded-for') ??
               req.headers.get('x-real-ip') ??
               '127.0.0.1'

    const { success, limit, remaining } = await chatRatelimit.limit(ip)

    if (!success) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a minute before asking again.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
          }
        }
      )
    }

    // Query embedding — asymmetric input_type ('search_query'), matching
    // how chunks were embedded with 'search_document' at upload time.
    const queryEmbedding = await embedQuery(userQuery)

    const docIds = selectedDocIds?.length
      ? selectedDocIds.map((id: string) => parseInt(id, 10))
      : [-1]

    // Hybrid search: vector similarity + full-text search, fused with
    // Reciprocal Rank Fusion (see supabase/schema.sql). Falls back to
    // the same fallback path as before if the RPC errors or is empty.
    const { data: chunks, error: hybridError } = await supabaseAdmin.rpc('hybrid_search_chunks', {
      query_text: userQuery,
      query_embedding: queryEmbedding,
      match_count: 5,
      filter_session_id: session_id,
      filter_doc_ids: docIds,
    })

    if (hybridError) {
      console.error('❌ Hybrid search error:', hybridError)
    }

    let finalChunks: ChunkRow[] | null = chunks

    if (!finalChunks || finalChunks.length === 0) {
      const { data: fallback } = await supabaseAdmin
        .from('chunks')
        .select('content, document_id')
        .in('document_id', selectedDocIds?.length ? selectedDocIds : [''])
        .eq('session_id', session_id)
        .limit(5)
      finalChunks = fallback
    }

    const context = finalChunks?.map((c: ChunkRow) => c.content).join('\n\n') || 'No context found.'

    const sources = (finalChunks || []).map((c: ChunkRow) => ({
      content: c.content,
      document_id: c.document_id,
      similarity: (c.similarity && !isNaN(c.similarity) && c.similarity > 0)
        ? Math.round(c.similarity * 100)
        : null,
    }))

    // Multi-turn memory: carry the last few turns of conversation into
    // the prompt, not just the current question. Previously only the
    // final user message was ever sent to Groq, so follow-ups like
    // "what about the second one?" had no prior context to resolve
    // against. History is trimmed to MAX_HISTORY_MESSAGES and excludes
    // the current message (added separately below with fresh context).
    const priorHistory: IncomingMessage[] = (messages as IncomingMessage[])
      .slice(0, -1)
      .slice(-MAX_HISTORY_MESSAGES)

    const fullMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      {
        role: 'system',
        content: `You are a helpful assistant. Answer the user's question using ONLY the following context from their uploaded document(s). Always mention where in the document you found the answer. Use the prior conversation only to resolve references (e.g. "it", "the second one") — the CONTEXT below is the sole source of truth for facts.

CONTEXT:
${context}`
      },
      ...priorHistory.map(m => ({ role: m.role, content: m.content })),
      {
        role: 'user',
        content: userQuery
      }
    ]

    const stream = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      stream: true,
      temperature: 0.2,
      messages: fullMessages,
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ sources })}\n\n`))
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || ''
          if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    return new NextResponse(readable, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })

  } catch (err) {
    console.error('❌ CHAT ERROR:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}