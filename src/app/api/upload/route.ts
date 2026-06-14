import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { embedText } from '@/lib/embeddings'
import { uploadRatelimit } from '@/lib/ratelimit'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// 👇 NEW: generates a 2-sentence summary from first 3 chunks
async function generateSummary(chunks: string[]): Promise<string> {
  try {
    const preview = chunks.slice(0, 3).join('\n\n').slice(0, 1500)

    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      temperature: 0.3,
      max_tokens: 60,
      messages: [
        {
          role: 'system',
          content: 'Summarize the following document content in exactly 2 sentences. Be concise and factual.'
        },
        {
          role: 'user',
          content: preview
        }
      ],
    })

    return completion.choices[0]?.message?.content?.trim() || ''
  } catch (err) {
    console.error('Summary generation failed:', err)
    return ''  // don't crash upload if summary fails
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const sessionId = formData.get('session_id') as string

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    if (!sessionId) {
      return NextResponse.json({ error: 'No session ID provided' }, { status: 400 })
    }

    // Rate limiting
    const ip = req.headers.get('x-forwarded-for') ??
               req.headers.get('x-real-ip') ??
               '127.0.0.1'

    const { success } = await uploadRatelimit.limit(ip)

    if (!success) {
      return NextResponse.json(
        { error: 'Upload limit reached. You can upload up to 5 documents per hour.' },
        { status: 429 }
      )
    }

    if (file.type === 'application/pdf') {
      return NextResponse.json({
        error: 'Please convert your PDF to a .txt file and upload that instead.'
      }, { status: 400 })
    }

    const text = await file.text()

    // Count words
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length

    // Chunk with overlap
    const chunkSize = 500
    const overlap = 100
    const chunks: string[] = []

    let i = 0
    while (i < text.length) {
      chunks.push(text.slice(i, i + chunkSize))
      i += chunkSize - overlap
    }

    // 👇 NEW: generate summary before saving (uses first 3 chunks)
    const summary = await generateSummary(chunks)

    // Save document to Supabase
    const { data: doc, error: docError } = await supabaseAdmin
      .from('documents')
      .insert({
        name: file.name,
        session_id: sessionId,
        summary: summary,   // 👈 NEW
      })
      .select()
      .single()

    if (docError) throw docError

    // Embed and save each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const embedding = await embedText(chunk)
      const { error: chunkError } = await supabaseAdmin
        .from('chunks')
        .insert({
          document_id: doc.id,
          content: chunk,
          embedding_v2: embedding,
          chunk_index: i,
          session_id: sessionId,
        })
      if (chunkError) throw chunkError
    }

    return NextResponse.json({
      success: true,
      document: doc,
      chunksCreated: chunks.length,
      wordCount,
      summary,   // 👈 NEW
    })

  } catch (err: any) {
    console.error('❌ UPLOAD ERROR:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}