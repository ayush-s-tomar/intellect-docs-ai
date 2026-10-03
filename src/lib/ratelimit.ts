import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { env } from '@/lib/env'
import { RATE_LIMIT } from '@/lib/config'
import { logger } from '@/lib/logger'

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
})

export const chatRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(RATE_LIMIT.CHAT.MAX_REQUESTS, RATE_LIMIT.CHAT.WINDOW),
  analytics: true,
  prefix: 'askmydocs:chat',
})

export const uploadRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(RATE_LIMIT.UPLOAD.MAX_REQUESTS, RATE_LIMIT.UPLOAD.WINDOW),
  analytics: true,
  prefix: 'askmydocs:upload',
})

type LimitResult = { success: boolean; limit: number; remaining: number }

// Fail open: if Redis is unreachable, log it and allow the request.
export async function safeLimit(rl: Ratelimit, identifier: string): Promise<LimitResult> {
  try {
    const { success, limit, remaining } = await rl.limit(identifier)
    return { success, limit, remaining }
  } catch (e: any) {
    logger.warn('ratelimit', 'Rate limiter unreachable, allowing request', {
      error: String(e),
      causeCode: e?.cause?.code,
    })
    return { success: true, limit: 0, remaining: 0 }
  }
}