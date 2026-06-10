import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { embedText } from '@/lib/embeddings'
import { uploadRatelimit } from '@/lib/ratelimit'

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

    // 👇 NEW: chunk with overlap instead of hard cuts
    const chunkSize = 500
    const overlap = 100   // last 100 chars of previous chunk repeated at start of next
    const chunks: string[] = []

    let i = 0
    while (i < text.length) {
      chunks.push(text.slice(i, i + chunkSize))
      i += chunkSize - overlap   // 👈 move forward by 400, not 500
    }

    // Save document to Supabase
    const { data: doc, error: docError } = await supabaseAdmin
      .from('documents')
      .insert({
        name: file.name,
        session_id: sessionId,
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
          embedding_v3: embedding,   // 👈 must be v3 now
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
    })

  } catch (err: any) {
    console.error('❌ UPLOAD ERROR:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}