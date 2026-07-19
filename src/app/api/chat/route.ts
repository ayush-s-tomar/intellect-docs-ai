import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Groq from 'groq-sdk'
import { embedText } from '@/lib/embeddings'
import { chatRatelimit } from '@/lib/ratelimit'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

interface ChunkRow {
  content: string
  document_id: number
  similarity?: number
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

    const queryEmbedding = await embedText(userQuery)

    const docIds = selectedDocIds?.length
      ? selectedDocIds.map((id: string) => parseInt(id, 10))
      : [-1]

    const { data: chunks, error: vectorError } = await supabaseAdmin.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      match_count: 5,
      filter_session_id: session_id,
      filter_doc_ids: docIds,
    })

    if (vectorError) {
      console.error('❌ Vector search error:', vectorError)
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

    const fullMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      {
        role: 'system',
        content: `You are a helpful assistant. Answer the user's question using ONLY the following context from their uploaded document. Always mention where in the document you found the answer.

CONTEXT:
${context}`
      },
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