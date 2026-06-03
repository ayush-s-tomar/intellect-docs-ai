import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { embedText } from '@/lib/embeddings'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
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
      .insert({ name: file.name })
      .select()
      .single()

    if (docError) throw docError

    // Embed each chunk and save
    for (const chunk of chunks) {
      const embedding = await embedText(chunk)
      const { error: chunkError } = await supabaseAdmin
        .from('chunks')
        .insert({
          document_id: doc.id,
          content: chunk,
          embedding: embedding,
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