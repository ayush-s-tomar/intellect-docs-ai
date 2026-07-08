import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { embedText } from '@/lib/embeddings'
import { uploadRatelimit } from '@/lib/ratelimit'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

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
    return ''
  }
}

// Section-aware chunking: splits on blank-line paragraph/section boundaries
// first, then only falls back to character slicing for any section that's
// still too long. Keeps each chunk's text aligned with a single topic, so
// vector similarity matches line up with the section that actually answers
// the question, instead of cutting mid-section like raw character slicing did.
function chunkText(text: string, maxChunkSize = 700, overlap = 100): string[] {
  const rawSections = text
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(Boolean)

  const chunks: string[] = []

  for (const section of rawSections) {
    if (section.length <= maxChunkSize) {
      chunks.push(section)
      continue
    }

    let i = 0
    while (i < section.length) {
      chunks.push(section.slice(i, i + maxChunkSize))
      i += maxChunkSize - overlap
    }
  }

  // Merge very small chunks (e.g. lone heading lines) into the following
  // chunk so headings stay attached to their content.
  const merged: string[] = []
  for (const chunk of chunks) {
    if (merged.length > 0 && merged[merged.length - 1].length < 80) {
      merged[merged.length - 1] = merged[merged.length - 1] + '\n\n' + chunk
    } else {
      merged.push(chunk)
    }
  }

  return merged
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

    const wordCount = text.trim().split(/\s+/).filter(Boolean).length

    // Section-aware chunking instead of raw character slicing
    const chunks = chunkText(text, 700, 100)

    const summary = await generateSummary(chunks)

    const { data: doc, error: docError } = await supabaseAdmin
      .from('documents')
      .insert({
        name: file.name,
        session_id: sessionId,
        summary: summary,
      })
      .select()
      .single()

    if (docError) throw docError

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
      summary,
    })

  } catch (err: any) {
    console.error('❌ UPLOAD ERROR:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}