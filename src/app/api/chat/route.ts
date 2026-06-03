import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { embedText } from '@/lib/embeddings'
import Groq from 'groq-sdk'

// Force it to use your key directly if your .env file is being stubborn
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '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' })

export async function POST(req: NextRequest) {
  try {
    const { messages, selectedDocIds } = await req.json()
    const userQuery = messages[messages.length - 1].content

    const queryEmbedding = await embedText(userQuery)

    const { data: chunks, error: rpcError } = await supabaseAdmin.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.0, 
      match_count: 5,
      filter_doc_ids: selectedDocIds?.length ? selectedDocIds : null,
    })

    if (rpcError) {
      console.error("❌ RPC match_chunks Error:", rpcError)
    }

    const context = chunks?.map((c: any) => c.content).join('\n\n') || 'No context found.'
    const sources = chunks || []

    // Cleaned up prompt structure for Llama 3
    const fullMessages = [
      { 
        role: 'system', 
        content: `You are a helpful assistant. Answer the user's question using ONLY the following text context. 
        
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
    console.error("❌ CHAT ROUTE ERROR:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}