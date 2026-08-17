import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { embedQuery } from '@/lib/embeddings'
import { chatRatelimit } from '@/lib/ratelimit'
import { chatRequestSchema, formatZodError } from '@/lib/validation'
import { env } from '@/lib/env'
import { apiError, handleApiError, ApiHandledError } from '@/lib/api-response'
import { searchChunksHybrid, chunksToContext, chunksToSources } from '@/lib/chunks-repository'
import { CHAT, RETRIEVAL } from '@/lib/config'

const groq = new Groq({ apiKey: env.GROQ_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json()

    const parseResult = chatRequestSchema.safeParse(rawBody)
    if (!parseResult.success) {
      return apiError('VALIDATION_ERROR', formatZodError(parseResult.error))
    }
    const { messages, selectedDocIds, session_id } = parseResult.data
    const userQuery = messages[messages.length - 1].content

    const ip = req.headers.get('x-forwarded-for') ??
               req.headers.get('x-real-ip') ??
               '127.0.0.1'

    const { success, limit, remaining } = await chatRatelimit.limit(ip)

    if (!success) {
      return apiError(
        'RATE_LIMITED',
        'Too many requests. Please wait a minute before asking again.',
        {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
        }
      )
    }

    const queryEmbedding = await embedQuery(userQuery)

    const docIds = selectedDocIds.length
      ? selectedDocIds.map((id: string) => parseInt(id, 10))
      : [-1]

    const finalChunks = await searchChunksHybrid({
      queryText: userQuery,
      queryEmbedding,
      matchCount: RETRIEVAL.MATCH_COUNT,
      sessionId: session_id,
      docIds,
    })

    const context = chunksToContext(finalChunks)
    const sources = chunksToSources(finalChunks)

    const priorHistory = messages.slice(0, -1).slice(-CHAT.MAX_HISTORY_MESSAGES)

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

    let stream
    try {
      stream = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        stream: true,
        temperature: 0.2,
        messages: fullMessages,
      })
    } catch (err) {
      throw new ApiHandledError('UPSTREAM_ERROR', `Groq request failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    }

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
    return handleApiError(err, 'chat')
  }
}
