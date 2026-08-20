import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { embedText } from '@/lib/embeddings'
import { chunkText } from '@/lib/chunker'
import { uploadRatelimit } from '@/lib/ratelimit'
import { uploadFieldsSchema } from '@/lib/validation'
import { env } from '@/lib/env'
import { apiSuccess, apiError, handleApiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: env.GROQ_API_KEY })

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
    logger.warn('upload', 'Summary generation failed', {
      error: err instanceof Error ? err.message : 'unknown',
    })
    return ''
  }
}

export async function POST(req: NextRequest) {
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

    const ip = req.headers.get('x-forwarded-for') ??
               req.headers.get('x-real-ip') ??
               '127.0.0.1'

    const { success } = await uploadRatelimit.limit(ip)

    if (!success) {
      return apiError('RATE_LIMITED', 'Upload limit reached. You can upload up to 5 documents per hour.')
    }

    if (file.type === 'application/pdf') {
      return apiError('VALIDATION_ERROR', 'Please convert your PDF to a .txt file and upload that instead.')
    }

    const text = await file.text()
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length

    const chunks = chunkText(text)

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

    if (docError) {
      logger.error('upload', 'Document insert failed', { error: docError.message, sessionId })
      throw docError
    }

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
      if (chunkError) {
        logger.error('upload', 'Chunk insert failed', { error: chunkError.message, sessionId, chunkIndex: i })
        throw chunkError
      }
    }

    logger.info('upload', 'Document uploaded successfully', {
      sessionId,
      documentId: doc.id,
      chunksCreated: chunks.length,
      wordCount,
    })

    return apiSuccess({
      document: doc,
      chunksCreated: chunks.length,
      wordCount,
      summary,
    })

  } catch (err) {
    return handleApiError(err, 'upload')
  }
}