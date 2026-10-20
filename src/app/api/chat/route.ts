import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { embedQuery } from '@/lib/embeddings'
import { chatRatelimit, safeLimit } from '@/lib/ratelimit'
import { chatRequestSchema, formatZodError } from '@/lib/validation'
import { env } from '@/lib/env'
import { apiError, handleApiError, ApiHandledError } from '@/lib/api-response'
import { searchChunksHybrid, chunksToContext, chunksToSources } from '@/lib/chunks-repository'
import { CHAT, RETRIEVAL } from '@/lib/config'
import { logger } from '@/lib/logger'
import { buildSystemPrompt } from '@/lib/prompts'

const groq = new Groq({ apiKey: env.GROQ_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const startedAt = Date.now()
    const rawBody = await req.json()

    const parseResult = chatRequestSchema.safeParse(rawBody)
    if (!parseResult.success) {
      return apiError('VALIDATION_ERROR', formatZodError(parseResult.error))
    }
    const { messages, selectedDocIds, session_id } = parseResult.data
    const userQuery = messages[messages.length - 1].content

    // x-forwarded-for can hold a comma-separated chain; the first entry is the client.
    const forwarded = req.headers.get('x-forwarded-for')
    const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '127.0.0.1'

    const { success, limit, remaining } = await safeLimit(chatRatelimit, ip)

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

    const parsedIds = selectedDocIds
      .map((id: string) => parseInt(id, 10))
      .filter(Number.isFinite)
    const docIds = parsedIds.length ? parsedIds : [-1]

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
        content: buildSystemPrompt(context)
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
        model: 'openai/gpt-oss-20b',
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
        // Enqueue can throw if the client disconnected; that is not an error worth surfacing.
        const send = (payload: string) => {
          try {
            controller.enqueue(encoder.encode(payload))
          } catch {
            /* client disconnected */
          }
        }

        let emittedChars = 0
        let finishReason: string | null = null

        try {
          send(`data: ${JSON.stringify({ sources })}\n\n`)
          for await (const chunk of stream) {
            const choice = chunk.choices[0]
            if (choice?.finish_reason) finishReason = choice.finish_reason
            const text = choice?.delta?.content || ''
            if (text) {
              emittedChars += text.length
              send(`data: ${JSON.stringify({ text })}\n\n`)
            }
          }

          if (emittedChars === 0) {
            send(`data: ${JSON.stringify({ text: 'The model returned an empty response. Please try asking again.' })}\n\n`)
          }
          if (emittedChars === 0 || (finishReason && finishReason !== 'stop')) {
            logger.warn('chat', 'Abnormal model completion', {
              finishReason,
              emittedChars,
              sourceCount: sources.length,
              latencyMs: Date.now() - startedAt,
            })
          }
        } catch (err) {
          logger.error('chat', 'Stream interrupted', {
            error: err instanceof Error ? err.message : 'unknown error',
            emittedChars,
            latencyMs: Date.now() - startedAt,
          })
          send(`data: ${JSON.stringify({ text: '\n\n[The response was interrupted. Please try again.]' })}\n\n`)
        } finally {
          send('data: [DONE]\n\n')
          try {
            controller.close()
          } catch {
            /* already closed */
          }
        }
      },
    })

    return new NextResponse(readable, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })

  } catch (err) {
    return handleApiError(err, 'chat')
  }
}