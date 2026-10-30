import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { apiSuccess, apiError, handleApiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { RETENTION } from '@/lib/config'
import { expiryCutoff } from '@/lib/retention'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BATCH = 200

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // Fail closed: without a configured secret nobody can run the cleanup.
  if (!secret) return false
  const given = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Vercel Cron calls this with GET and "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: NextRequest) {
  try {
    if (!authorized(req)) {
      return apiError('VALIDATION_ERROR', 'Unauthorized')
    }

    const cutoff = expiryCutoff(new Date(), RETENTION.DAYS).toISOString()

    const { data: expired, error: selectError } = await supabaseAdmin
      .from('documents')
      .select('id')
      .lt('created_at', cutoff)
      .limit(BATCH)

    if (selectError) {
      logger.error('cleanup', 'Select failed', { error: selectError.message })
      return apiError('UPSTREAM_ERROR', 'Cleanup failed')
    }

    const ids = (expired ?? []).map(d => d.id)
    if (ids.length === 0) {
      return apiSuccess({ deleted: 0, cutoff })
    }

    // Chunks first, so nothing is orphaned even without ON DELETE CASCADE.
    const { error: chunkError } = await supabaseAdmin.from('chunks').delete().in('document_id', ids)
    if (chunkError) {
      logger.error('cleanup', 'Chunk delete failed', { error: chunkError.message })
      return apiError('UPSTREAM_ERROR', 'Cleanup failed')
    }

    const { error: docError } = await supabaseAdmin.from('documents').delete().in('id', ids)
    if (docError) {
      logger.error('cleanup', 'Document delete failed', { error: docError.message })
      return apiError('UPSTREAM_ERROR', 'Cleanup failed')
    }

    logger.info('cleanup', 'Expired documents deleted', { deleted: ids.length, cutoff })
    return apiSuccess({ deleted: ids.length, cutoff })
  } catch (err) {
    return handleApiError(err, 'cleanup')
  }
}