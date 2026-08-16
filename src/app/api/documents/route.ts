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
      logger.error('documents', 'Fetch failed', { error: error.message, sessionId })
      return apiError('UPSTREAM_ERROR', 'Failed to fetch documents')
    }

    return apiSuccess(data || [])

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
      return apiError('VALIDATION_ERROR', 'session_id is required')
    }

    const bodyResult = documentsDeleteSchema.safeParse(rawBody)
    if (!bodyResult.success) {
      return apiError('VALIDATION_ERROR', 'Document id is required')
    }

    const { error } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('id', bodyResult.data.id)
      .eq('session_id', sessionResult.data.session_id)

    if (error) {
      logger.error('documents', 'Delete failed', { error: error.message, documentId: bodyResult.data.id })
      return apiError('UPSTREAM_ERROR', 'Failed to delete document')
    }

    logger.info('documents', 'Document deleted', { documentId: bodyResult.data.id, sessionId: sessionResult.data.session_id })
    return apiSuccess({ deleted: true })

  } catch (err) {
    return handleApiError(err, 'documents.DELETE')
  }
}
