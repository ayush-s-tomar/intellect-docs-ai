import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { env } from '@/lib/env'
import { RATE_LIMIT } from '@/lib/config'

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
