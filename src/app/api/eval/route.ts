import { NextRequest } from 'next/server'
import Groq from 'groq-sdk'
import { automatedEvalQuestions, type DeterministicCheck } from '@/lib/evalQuestions'
import { evalRequestSchema, formatZodError } from '@/lib/validation'
import { env } from '@/lib/env'
import { apiSuccess, apiError, handleApiError, ApiHandledError } from '@/lib/api-response'
import { isGroqDailyLimitError, DAILY_LIMIT_MESSAGE } from '@/lib/groq-errors'
import { embedQuery } from '@/lib/embeddings'
import { searchChunksHybrid, chunksToContext } from '@/lib/chunks-repository'
import { evalRatelimit, safeLimit, getClientIp } from '@/lib/ratelimit'
import { RETRIEVAL, RATE_LIMIT } from '@/lib/config'
import { logger } from '@/lib/logger'
import { buildSystemPrompt } from '@/lib/prompts'

// The eval runs every automated question as a QA call plus a judge call and
// waits out Groq free-tier rate limits, so it can take a few minutes.
export const maxDuration = 300

const groq = new Groq({ apiKey: env.GROQ_API_KEY })

// Groq's free tier allows 8,000 tokens/minute on this model and counts the
// REQUESTED max_tokens against that limit, so budgets are kept small.
// openai/gpt-oss-20b is a reasoning model: hidden reasoning tokens count
// against max_tokens, so if the first attempt returns an empty answer we
// retry once with a larger budget instead of scoring an empty answer as 0.
const QA_TOKEN_BUDGETS = [1500, 3000]
const JUDGE_TOKEN_BUDGETS = [600, 1200]

const MAX_RATE_LIMIT_RETRIES = 6
const MAX_WAIT_MS = 60_000

const NOT_FOUND_PHRASES = [
  'not found in document',
  'not found in the document',
  'does not mention',
  "doesn't mention",
  'not mentioned',
  'no information',
  'does not contain',
  'not in the document',
]

type CheckResult = 'PASS' | 'FAIL' | 'N/A'

interface EvalRow {
  topic: string
  question: string
  answer: string
  score: number | null
  reason: string
  avgSimilarity: number
  chunksRetrieved: number
  check: CheckResult
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

function isRateLimitError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status
  const message = err instanceof Error ? err.message : String(err)
  return status === 429 || message.includes('rate_limit_exceeded')
}

// Parses Groq messages like "Please try again in 3.015s", "1m2.5s" or "450ms".
function parseRetryDelayMs(err: unknown): number | null {
  const message = err instanceof Error ? err.message : String(err)
  const match = message.match(/try again in ([0-9hms.]+)/i)
  if (!match) return null

  const t = match[1]
  const minutes = t.match(/(\d+(?:\.\d+)?)m(?!s)/)
  const seconds = t.match(/(\d+(?:\.\d+)?)s/)
  const millis = t.match(/(\d+(?:\.\d+)?)ms/)

  let ms = 0
  if (minutes) ms += parseFloat(minutes[1]) * 60_000
  if (seconds) ms += parseFloat(seconds[1]) * 1000
  if (millis) ms += parseFloat(millis[1])
  return ms > 0 ? ms : null
}

async function withRateLimitRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      // The daily token cap does not recover in a minute: stop immediately with a clear message.
      if (isGroqDailyLimitError(err)) throw new ApiHandledError('RATE_LIMITED', DAILY_LIMIT_MESSAGE)
      if (!isRateLimitError(err) || attempt > MAX_RATE_LIMIT_RETRIES) throw err

      const hinted = parseRetryDelayMs(err)

      // A hint far beyond a minute means a daily limit, not a per-minute one.
      if (hinted !== null && hinted > MAX_WAIT_MS) throw err

      const waitMs = Math.min((hinted ?? 5000 * attempt) + 500, MAX_WAIT_MS)
      logger.warn('eval', `${label}: rate limited, waiting`, { waitMs, attempt })
      await sleep(waitMs)
    }
  }
}

// Deterministic checks: no LLM involved. Open-ended questions with neither
// keywords nor a check report N/A instead of a fake PASS.
function runCheck(answer: string, check: DeterministicCheck | undefined, keywords: string[]): CheckResult {
  const lower = answer.toLowerCase()
  const outcomes: boolean[] = []

  if (keywords.length > 0) outcomes.push(keywords.some(kw => lower.includes(kw.toLowerCase())))
  if (check === 'contains_number') outcomes.push(/\d/.test(answer))
  if (check === 'not_found') outcomes.push(NOT_FOUND_PHRASES.some(p => lower.includes(p)))

  if (outcomes.length === 0) return 'N/A'
  return outcomes.every(Boolean) ? 'PASS' : 'FAIL'
}

async function generateAnswer(
  question: string,
  context: string
): Promise<{ answer: string; finishReason: string | null | undefined }> {
  let finishReason: string | null | undefined

  for (const budget of QA_TOKEN_BUDGETS) {
    const completion = await withRateLimitRetry('eval QA', () =>
      groq.chat.completions.create({
        model: 'openai/gpt-oss-20b',
        temperature: 0.2,
        max_tokens: budget,
        reasoning_effort: 'low',
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(context)
          },
          {
            role: 'user',
            content: question
          }
        ],
      })
    )

    const answer = completion.choices[0]?.message?.content?.trim() || ''
    finishReason = completion.choices[0]?.finish_reason

    if (answer) return { answer, finishReason }

    logger.error('eval', 'Empty answer from QA completion, retrying with bigger budget', {
      question,
      finishReason,
      maxTokens: budget,
    })
  }

  return { answer: '', finishReason }
}

// Returns score = null when the judge call itself failed. Unscored questions
// are excluded from the average instead of being counted as a 0.
//
// expectNotFound is true only for the deliberate grounding probe, whose correct
// answer is "not found". For every other question a "not found" answer is NOT
// rewarded by default: the judge must check whether the context really lacked
// the answer, otherwise a lazy refusal would score full marks.
async function scoreAnswer(
  question: string,
  answer: string,
  fullContext: string,
  expectNotFound: boolean
): Promise<{ score: number | null; reason: string }> {
  const notFoundRule = expectNotFound
    ? `This question is deliberately unanswerable from any normal document. The correct answer is that the information is not found. Score 9-10 only if the answer says so and invents no details; score 0-2 if it invents an answer.`
    : `If the answer says the information was not found, check the CONTEXT: if the context contains relevant information that the answer missed, score 0-3. Only score a "not found" answer high when the context truly lacks the answer.`

  let raw = ''
  try {
    // IMPORTANT: the judge sees the SAME, UNTRUNCATED context the answer model
    // saw. Slicing it would hide chunks and penalize correct answers as
    // "not in context".
    let finishReason: string | null | undefined

    for (const budget of JUDGE_TOKEN_BUDGETS) {
      const completion = await withRateLimitRetry('eval judge', () =>
        groq.chat.completions.create({
          model: 'openai/gpt-oss-20b',
          temperature: 0,
          max_tokens: budget,
          reasoning_effort: 'low',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `You are an evaluator. Score the answer from 0 to 10 based on:
- Relevance to the question (0-4 points)
- Accuracy based on the context (0-4 points)
- Clarity and completeness (0-2 points)

${notFoundRule}

Reply ONLY in this exact JSON format:
{"score": 7, "reason": "one sentence explanation"}`
            },
            {
              role: 'user',
              content: `QUESTION: ${question}
CONTEXT: ${fullContext}
ANSWER: ${answer}

Score this answer:`
            }
          ],
        })
      )

      raw = completion.choices[0]?.message?.content?.trim() || ''
      finishReason = completion.choices[0]?.finish_reason
      if (raw) break

      logger.error('eval', 'Empty judge response, retrying with bigger budget', {
        finishReason,
        maxTokens: budget,
      })
    }

    if (!raw) {
      throw new Error(`Empty judge response (finish_reason: ${finishReason})`)
    }

    const cleaned = raw.replace(/```json\s*|```\s*/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON object found in judge response')
    }

    const parsed = JSON.parse(jsonMatch[0])
    const numeric = Number(parsed.score)
    if (!Number.isFinite(numeric)) {
      throw new Error('Judge returned a non-numeric score')
    }

    return {
      score: Math.min(10, Math.max(0, numeric)),
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    }
  } catch (err) {
    // A deliberate, user-facing stop (daily limit) must abort the run, not become "unscored".
    if (err instanceof ApiHandledError) throw err
    logger.error('eval', 'Judge call failed; question left unscored', {
      error: err instanceof Error ? err.message : String(err),
      raw,
    })
    return { score: null, reason: 'Judge call failed; this question is unscored.' }
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json()

    const parseResult = evalRequestSchema.safeParse(rawBody)
    if (!parseResult.success) {
      return apiError('VALIDATION_ERROR', formatZodError(parseResult.error))
    }
    const { session_id, document_id } = parseResult.data

    const docId = parseInt(document_id, 10)
    if (isNaN(docId)) {
      return apiError('VALIDATION_ERROR', 'document_id must be a valid number')
    }

    // One run makes 16+ Groq calls, so it is limited far harder than chat.
    const { success: allowed } = await safeLimit(evalRatelimit, getClientIp(req))
    if (!allowed) {
      return apiError(
        'RATE_LIMITED',
        `Eval limit reached. Each run makes many model calls, so it is limited to ${RATE_LIMIT.EVAL.MAX_REQUESTS} runs per hour.`
      )
    }

    const results: EvalRow[] = []
    let totalChunksRetrieved = 0

    for (const evalQ of automatedEvalQuestions) {
      const queryEmbedding = await embedQuery(evalQ.question)

      const finalChunks = await searchChunksHybrid({
        queryText: evalQ.question,
        queryEmbedding,
        matchCount: RETRIEVAL.MATCH_COUNT,
        sessionId: session_id,
        docIds: [docId],
      })

      totalChunksRetrieved += finalChunks.length
      const context = chunksToContext(finalChunks)

      const avgSimilarity = finalChunks.length > 0
        ? Math.round(
            finalChunks.reduce((sum, c) => sum + (c.similarity || 0), 0)
            / finalChunks.length * 100
          )
        : 0

      const { answer, finishReason: answerFinishReason } = await generateAnswer(
        evalQ.question,
        context
      )

      if (!answer) {
        logger.error('eval', 'Still empty answer after retry', {
          question: evalQ.question,
          finishReason: answerFinishReason,
          chunksRetrieved: finalChunks.length,
        })
      }

      const { score, reason } = await scoreAnswer(
        evalQ.question,
        answer,
        context,
        evalQ.check === 'not_found'
      )

      results.push({
        topic: evalQ.topic,
        question: evalQ.question,
        answer,
        score,
        reason,
        avgSimilarity,
        chunksRetrieved: finalChunks.length,
        check: runCheck(answer, evalQ.check, evalQ.expectedKeywords),
      })
    }

    const scored = results.filter((r): r is EvalRow & { score: number } => r.score !== null)
    if (scored.length === 0) {
      return apiError(
        'UPSTREAM_ERROR',
        'Every judge call failed (usually Groq rate limits). Wait a minute and run the eval again.'
      )
    }

    const avgScore = Math.round((scored.reduce((sum, r) => sum + r.score, 0) / scored.length) * 10) / 10
    const avgChunks = Math.round(totalChunksRetrieved / automatedEvalQuestions.length * 10) / 10
    const passCount = scored.filter(r => r.score >= 6).length
    const checked = results.filter(r => r.check !== 'N/A')

    return apiSuccess({
      summary: {
        totalQuestions: automatedEvalQuestions.length,
        scored: scored.length,
        unscored: results.length - scored.length,
        averageScore: avgScore,
        passed: passCount,
        failed: scored.length - passCount,
        passRate: Math.round(passCount / scored.length * 100),
        checksTotal: checked.length,
        checksPassed: checked.filter(r => r.check === 'PASS').length,
        avgChunksRetrieved: avgChunks,
        grade: avgScore >= 8 ? 'A' : avgScore >= 6 ? 'B' : avgScore >= 4 ? 'C' : 'D',
      },
      results,
    })

  } catch (err) {
    return handleApiError(err, 'eval')
  }
}