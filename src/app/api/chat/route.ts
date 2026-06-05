import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { messages, selectedDocIds, session_id } = await req.json()  // 👈 NEW: session_id
    const userQuery = messages[messages.length - 1].content

    // Search for relevant chunks using text matching
    const { data: chunks } = await supabaseAdmin
      .from('chunks')
      .select('content, document_id')
      .in('document_id', selectedDocIds?.length ? selectedDocIds : [''])
      .eq('session_id', session_id)   // 👈 NEW: only search this user's chunks
      .textSearch('content', userQuery.split(' ').slice(0, 3).join(' | '), {
        type: 'websearch',
        config: 'english'
      })
      .limit(5)

    // Fallback: if text search returns nothing, just get first 5 chunks
    let finalChunks = chunks
    if (!chunks || chunks.length === 0) {
      const { data: fallback } = await supabaseAdmin
        .from('chunks')
        .select('content, document_id')
        .in('document_id', selectedDocIds?.length ? selectedDocIds : [''])
        .eq('session_id', session_id)   // 👈 NEW: fallback also scoped to session
        .limit(5)
      finalChunks = fallback
    }

    const context = finalChunks?.map((c: any) => c.content).join('\n\n') || 'No context found.'
    const sources = finalChunks || []

    const fullMessages = [
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