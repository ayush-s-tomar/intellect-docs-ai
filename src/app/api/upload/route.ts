import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { embedText } from '@/lib/embeddings'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const sessionId = formData.get('session_id') as string  // 👈 NEW LINE

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // 👇 NEW: reject if no session ID
    if (!sessionId) {
      return NextResponse.json({ error: 'No session ID provided' }, { status: 400 })
    }

    // Block PDF files
    if (file.type === 'application/pdf') {
      return NextResponse.json({ 
        error: 'Please convert your PDF to a .txt file and upload that instead.' 
      }, { status: 400 })
    }

    // Read file as text
    const text = await file.text()

    // Split into chunks of 500 characters
    const chunkSize = 500
    const chunks = []
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize))
    }

    // Save document record to Supabase
    const { data: doc, error: docError } = await supabaseAdmin
      .from('documents')
      .insert({ 
        name: file.name,
        session_id: sessionId,   // 👈 NEW: attach session to document
      })
      .select()
      .single()

    if (docError) throw docError

    // Embed each chunk and save with chunk_index
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const embedding = await embedText(chunk)
      const { error: chunkError } = await supabaseAdmin
        .from('chunks')
        .insert({
          document_id: doc.id,
          content: chunk,
          embedding: embedding,
          chunk_index: i,
          session_id: sessionId,   // 👈 NEW: attach session to each chunk
        })
      if (chunkError) throw chunkError
    }

    return NextResponse.json({
      success: true,
      document: doc,
      chunksCreated: chunks.length,
    })

  } catch (err: any) {
    console.error('❌ UPLOAD ERROR:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}