import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { embedBatch } from '@/lib/embeddings'
import { chunkText } from '@/lib/chunker'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    console.log("=== STARTING UPLOAD PROCESS ===")
    const text = await file.text()
    const chunks = chunkText(text)
    console.log(`File chunked successfully into ${chunks.length} parts.`)

    // 1. Insert parent document record
    const { data: doc, error: docError } = await supabaseAdmin
      .from('documents')
      .insert({ name: file.name })
      .select()
      .single()

    if (docError || !doc) {
      console.error("❌ SUPABASE DOCUMENTS INSERT ERROR:", docError)
      return NextResponse.json({ error: docError?.message || "Failed to create document record" }, { status: 500 })
    }
    console.log(`Parent document saved to database with ID: ${doc.id}`)

    // 2. Generate local embeddings
    console.log("Generating local embeddings via Xenova (this can take a few seconds)...")
    const embeddings = await embedBatch(chunks)
    console.log("Embeddings generated successfully!")

    // 3. Map rows and protect against undefined entries
    const rows = chunks.map((content, i) => ({
      document_id: doc.id,
      content,
      embedding: embeddings[i],
      chunk_index: i,
    }))

    // 4. Insert chunks into database
    const { error: chunkError } = await supabaseAdmin.from('chunks').insert(rows)
    if (chunkError) {
      console.error("❌ SUPABASE CHUNKS INSERT ERROR:", chunkError)
      return NextResponse.json({ error: chunkError.message }, { status: 500 })
    }

    console.log("=== UPLOAD COMPLETED SUCCESSFULLY ===")
    return NextResponse.json({ success: true, documentId: doc.id, chunkCount: chunks.length })
  } catch (e: any) {
    console.error("❌ CATCH BLOCK CRASH ERROR:", e)
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 })
  }
}