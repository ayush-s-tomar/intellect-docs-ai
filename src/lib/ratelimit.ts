import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Chat: max 10 requests per minute per IP
export const chatRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  analytics: true,
  prefix: 'askmydocs:chat',
})

// Upload: max 5 uploads per hour per IP
export const uploadRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '60 m'),
  analytics: true,
  prefix: 'askmydocs:upload',
})