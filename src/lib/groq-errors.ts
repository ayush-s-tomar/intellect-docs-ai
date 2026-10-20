// Helpers for recognising Groq rate-limit errors. Groq reports two different
// limits with the same 429 status: a per-minute limit that recovers in seconds
// (worth retrying) and a daily token cap that does not (worth stopping for).

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function isGroqRateLimitError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status
  return status === 429 || errorText(err).includes('rate_limit_exceeded')
}

export function isGroqDailyLimitError(err: unknown): boolean {
  return isGroqRateLimitError(err) && /tokens per day|\(TPD\)/i.test(errorText(err))
}

export const DAILY_LIMIT_MESSAGE =
  "The AI provider's free daily token limit has been reached. Please try again tomorrow."