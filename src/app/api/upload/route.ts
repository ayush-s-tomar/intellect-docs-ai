import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { embedBatch } from '@/lib/embeddings'
import { chunkText } from '@/lib/chunker'
import { uploadRatelimit, safeLimit, getClientIp } from '@/lib/ratelimit'
import { uploadFieldsSchema } from '@/lib/validation'
import { env } from '@/lib/env'
import { apiSuccess, apiError, handleApiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { UPLOAD, RATE_LIMIT } from '@/lib/config'
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
  let docId: string | number | null = null

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const rawSessionId = formData.get('session_id')

    if (!(file instanceof File)) {
      return apiError('VALIDATION_ERROR', 'No file uploaded')
    }

    const parseResult = uploadFieldsSchema.safeParse({ session_id: rawSessionId })
    if (!parseResult.success) {
      return apiError('VALIDATION_ERROR', 'No session ID provided')
    }
    const { session_id: sessionId } = parseResult.data

    // Fails open if Redis is down (logged inside safeLimit).
    const { success } = await safeLimit(uploadRatelimit, getClientIp(req))
    if (!success) {
      return apiError(
        'RATE_LIMITED',
        `Upload limit reached. You can upload up to ${RATE_LIMIT.UPLOAD.MAX_REQUESTS} documents per hour.`
      )
    }

    // The browser also checks these, but the server must not trust the client.
    if (file.size > UPLOAD.MAX_FILE_SIZE_BYTES) {
      return apiError(
        'VALIDATION_ERROR',
        `File too large. Maximum size is ${UPLOAD.MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.`
      )
    }

    if (file.type === 'application/pdf') {
      return apiError(
        'VALIDATION_ERROR',
        'Please convert your PDF to a .txt file and upload that instead.'
      )
    }

    // PDFs are converted to .txt in the browser, so only text formats arrive here.
    if (!/\.(txt|md)$/i.test(file.name)) {
      return apiError('VALIDATION_ERROR', 'Only .txt and .md files are supported.')
    }

    // Postgres text columns cannot store NUL characters, which some PDF
    // extractions produce; leaving them in turns the insert into a 500.
    const text = (await file.text()).replace(/\u0000/g, '')
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length
    const chunks = chunkText(text)

    if (chunks.length === 0) {
      return apiError('VALIDATION_ERROR', 'The file contains no readable text.')
    }

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
  } catch (err) {
    // Roll back a half-uploaded document so it doesn't linger in the sidebar.
    if (docId) {
      try {
        await supabaseAdmin.from('chunks').delete().eq('document_id', docId)
        await supabaseAdmin.from('documents').delete().eq('id', docId)
      } catch (cleanupErr) {
        logger.error('upload', 'Rollback failed', { error: String(cleanupErr), docId })
      }
    }
    const cause = (err as { cause?: { code?: string; message?: string } } | null)?.cause
    logger.error('upload', 'Upload failed', {
      error: String(err),
      causeCode: cause?.code,
      causeMessage: cause?.message,
    })
    return handleApiError(err, 'upload')
  }
}