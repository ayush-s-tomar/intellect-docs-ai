import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { embedBatch } from '@/lib/embeddings'
import { chunkText } from '@/lib/chunker'
import { uploadRatelimit } from '@/lib/ratelimit'
import { uploadFieldsSchema } from '@/lib/validation'
import { env } from '@/lib/env'
import { apiSuccess, apiError, handleApiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: env.GROQ_API_KEY })

const INSERT_BATCH_SIZE = 96

async function generateSummary(chunks: string[]): Promise<string> {
  try {
    const preview = chunks.slice(0, 3).join('\n\n').slice(0, 1500)

    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      temperature: 0.3,
      max_tokens: 200,
      reasoning_effort: 'low',
      messages: [
        {
          role: 'system',
          content: 'Summarize the following document content in exactly 2 sentences. Be concise and factual.',
        },
        { role: 'user', content: preview },
      ],
    })

    return completion.choices[0]?.message?.content?.trim() || ''
  } catch (err) {
    logger.warn('upload', 'Summary generation failed', {
      error: err instanceof Error ? err.message : 'unknown',
    })
    return ''
  }
}

export async function POST(req: NextRequest) {
  let docId: string | null = null

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const rawSessionId = formData.get('session_id') as string

    if (!file) {
      return apiError('VALIDATION_ERROR', 'No file uploaded')
    }

    const parseResult = uploadFieldsSchema.safeParse({ session_id: rawSessionId })
    if (!parseResult.success) {
      return apiError('VALIDATION_ERROR', 'No session ID provided')
    }
    const { session_id: sessionId } = parseResult.data

    const ip =
      req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '127.0.0.1'

    // Fail open: if the rate limiter backend is down, log it and let the upload through.
    try {
      const { success } = await uploadRatelimit.limit(ip)
      if (!success) {
        return apiError(
          'RATE_LIMITED',
          'Upload limit reached. You can upload up to 5 documents per hour.'
        )
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      logger.warn('upload', 'Rate limiter unreachable, allowing request', {
        error: String(e),
        causeCode: e?.cause?.code,
      })
    }

    if (file.type === 'application/pdf') {
      return apiError(
        'VALIDATION_ERROR',
        'Please convert your PDF to a .txt file and upload that instead.'
      )
    }

    const text = await file.text()
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length
    const chunks = chunkText(text)

    const summary = await generateSummary(chunks)

    const { data: doc, error: docError } = await supabaseAdmin
      .from('documents')
      .insert({ name: file.name, session_id: sessionId, summary })
      .select()
      .single()

    if (docError) {
      logger.error('upload', 'Document insert failed', { error: docError.message, sessionId })
      throw docError
    }
    docId = doc.id

    for (let i = 0; i < chunks.length; i += INSERT_BATCH_SIZE) {
      const batch = chunks.slice(i, i + INSERT_BATCH_SIZE)
      const embeddings = await embedBatch(batch)

      const rows = batch.map((content, j) => ({
        document_id: doc.id,
        content,
        embedding_v2: embeddings[j],
        chunk_index: i + j,
        session_id: sessionId,
      }))

      const { error: chunkError } = await supabaseAdmin.from('chunks').insert(rows)
      if (chunkError) {
        logger.error('upload', 'Chunk insert failed', {
          error: chunkError.message,
          sessionId,
          batchStart: i,
        })
        throw chunkError
      }
    }

    logger.info('upload', 'Document uploaded successfully', {
      sessionId,
      documentId: doc.id,
      chunksCreated: chunks.length,
      wordCount,
    })

    return apiSuccess({ document: doc, chunksCreated: chunks.length, wordCount, summary })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    // Roll back a half-uploaded document so it doesn't linger in the sidebar.
    if (docId) {
      await supabaseAdmin.from('chunks').delete().eq('document_id', docId)
      await supabaseAdmin.from('documents').delete().eq('id', docId)
    }
    logger.error('upload', 'Upload failed', {
      error: String(err),
      causeCode: err?.cause?.code,
      causeMessage: err?.cause?.message,
    })
    return handleApiError(err, 'upload')
  }
}
