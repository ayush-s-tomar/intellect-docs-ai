import { describe, it, expect } from 'vitest'
import { isGroqRateLimitError, isGroqDailyLimitError } from './groq-errors'

const perMinute = new Error(
  '429 {"error":{"message":"Rate limit reached ... on tokens per minute (TPM): Limit 8000 ... Please try again in 3.1s.","type":"tokens","code":"rate_limit_exceeded"}}'
)
const perDay = new Error(
  '429 {"error":{"message":"Rate limit reached ... on tokens per day (TPD): Limit 200000, Used 199086 ... Please try again in 5m7s.","type":"tokens","code":"rate_limit_exceeded"}}'
)

describe('groq error helpers', () => {
  it('recognises a rate-limit error by message or status', () => {
    expect(isGroqRateLimitError(perMinute)).toBe(true)
    expect(isGroqRateLimitError({ status: 429 })).toBe(true)
    expect(isGroqRateLimitError(new Error('network down'))).toBe(false)
  })

  it('treats the daily token cap as a daily limit', () => {
    expect(isGroqDailyLimitError(perDay)).toBe(true)
  })

  it('does not treat the per-minute limit as a daily limit', () => {
    expect(isGroqDailyLimitError(perMinute)).toBe(false)
  })

  it('ignores unrelated errors', () => {
    expect(isGroqDailyLimitError(new Error('boom'))).toBe(false)
    expect(isGroqDailyLimitError(null)).toBe(false)
  })
})