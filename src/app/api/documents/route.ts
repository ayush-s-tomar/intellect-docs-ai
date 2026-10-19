import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { documentsQuerySchema, documentsDeleteSchema } from '@/lib/validation'
import { apiSuccess, apiError, handleApiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get('session_id')

    const parseResult = documentsQuerySchema.safeParse({ session_id: sessionId })
    if (!parseResult.success) {
      return apiSuccess([])
    }

    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('id, name, created_at, summary')
      .eq('session_id', parseResult.data.session_id)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('documents', 'Fetch failed', { error: error.message })
      return apiError('UPSTREAM_ERROR', 'Failed to fetch documents')
    }

    const normalized = (data || []).map(doc => ({ ...doc, id: String(doc.id) }))
    return apiSuccess(normalized)

  } catch (err) {
    return handleApiError(err, 'documents.GET')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get('session_id')
    const rawBody = await req.json()

    const sessionResult = documentsQuerySchema.safeParse({ session_id: sessionId })
    if (!sessionResult.success) {
      return apiError('VALIDATION_ERROR', 'A valid session_id is required')
    }

    const bodyResult = documentsDeleteSchema.safeParse(rawBody)
    if (!bodyResult.success) {
      return apiError('VALIDATION_ERROR', 'A valid document id is required')
    }

    const session = sessionResult.data.session_id
    const documentId = bodyResult.data.id

    // Ownership check first: only a document in the caller's session can be
    // deleted, and a missing one is reported as such instead of "deleted".
    const { data: owned, error: lookupError } = await supabaseAdmin
      .from('documents')
      .select('id')
      .eq('id', documentId)
      .eq('session_id', session)
      .maybeSingle()

    if (lookupError) {
      logger.error('documents', 'Delete lookup failed', { error: lookupError.message, documentId })
      return apiError('UPSTREAM_ERROR', 'Failed to delete document')
    }
    if (!owned) {
      return apiError('NOT_FOUND', 'Document not found')
    }

    // Delete chunks explicitly so no orphans remain even if the foreign key
    // has no ON DELETE CASCADE in a given database.
    const { error: chunksError } = await supabaseAdmin
      .from('chunks')
      .delete()
      .eq('document_id', documentId)
      .eq('session_id', session)

    if (chunksError) {
      logger.error('documents', 'Chunk delete failed', { error: chunksError.message, documentId })
      return apiError('UPSTREAM_ERROR', 'Failed to delete document')
    }

    const { error: docError } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('id', documentId)
      .eq('session_id', session)

    if (docError) {
      logger.error('documents', 'Document delete failed', { error: docError.message, documentId })
      return apiError('UPSTREAM_ERROR', 'Failed to delete document')
    }

    logger.info('documents', 'Document deleted', { documentId })
    return apiSuccess({ deleted: true })

  } catch (err) {
    return handleApiError(err, 'documents.DELETE')
  }
}