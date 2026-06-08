import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import Groq from 'groq-sdk'
import { embedText } from '@/lib/embeddings'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { messages, selectedDocIds, session_id } = await req.json()
    const userQuery = messages[messages.length - 1].content

    // Embed the user's question using HuggingFace
    const queryEmbedding = await embedText(userQuery)

    // Vector similarity search
    const { data: chunks, error: vectorError } = await supabaseAdmin.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      match_count: 5,
      filter_session_id: session_id,
      filter_doc_ids: selectedDocIds?.length ? selectedDocIds : [-1],
    })

    if (vectorError) {
      console.error('❌ Vector search error:', vectorError)
    }

    // Fallback: if vector search returns nothing, get first 5 chunks
    let finalChunks = chunks
    if (!chunks || chunks.length === 0) {
      console.log('Vector search returned 0 results, using fallback...')
      const { data: fallback } = await supabaseAdmin
        .from('chunks')
        .select('content, document_id')
        .in('document_id', selectedDocIds?.length ? selectedDocIds : [''])
        .eq('session_id', session_id)
        .limit(5)
      finalChunks = fallback
    }

    const context = finalChunks?.map((c: any) => c.content).join('\n\n') || 'No context found.'
    const sources = finalChunks || []

    // 👇 Fixed: explicit type annotation to satisfy Groq SDK
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

  } catch (err: any) {
    console.error('❌ CHAT ERROR:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}