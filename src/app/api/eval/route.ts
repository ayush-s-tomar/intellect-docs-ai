import { NextRequest } from 'next/server'
import Groq from 'groq-sdk'
import { automatedEvalQuestions } from '@/lib/evalQuestions'
import { evalRequestSchema, formatZodError } from '@/lib/validation'
import { env } from '@/lib/env'
import { apiSuccess, apiError, handleApiError } from '@/lib/api-response'
import { embedQuery } from '@/lib/embeddings'
import { searchChunksHybrid, chunksToContext } from '@/lib/chunks-repository'
import { RETRIEVAL } from '@/lib/config'

// The eval runs 7 questions x (QA call + judge call) and now waits out
// Groq free-tier rate limits, so it can take a couple of minutes.
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
      if (!isRateLimitError(err) || attempt > MAX_RATE_LIMIT_RETRIES) throw err

      const hinted = parseRetryDelayMs(err)
      const waitMs = Math.min((hinted ?? 5000 * attempt) + 500, MAX_WAIT_MS)

      // A hint far beyond a minute means a daily limit, not a per-minute one.
      if (hinted !== null && hinted > MAX_WAIT_MS) throw err

      console.warn(`${label}: rate limited, waiting ${waitMs}ms (attempt ${attempt})`)
      await sleep(waitMs)
    }
  }
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
            content: `Answer the question using ONLY the following context.
If the answer is not in the context, say "Not found in document."
Be concise. Format the answer as short paragraphs or simple bullet lists. Never use markdown tables.

CONTEXT:
${context}`
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

    console.error('eval: empty answer from QA completion, retrying with bigger budget', {
      question,
      finishReason,
      maxTokens: budget,
    })
  }

  return { answer: '', finishReason }
}

async function scoreAnswer(
  question: string,
  answer: string,
  fullContext: string
): Promise<{ score: number; reason: string }> {
  let raw = ''
  try {
    // IMPORTANT: judge must see the SAME context the answer model saw,
    // otherwise it penalizes correct answers as "not in context".
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

Reply ONLY in this exact JSON format:
{"score": 7, "reason": "one sentence explanation"}`
            },
            {
              role: 'user',
              content: `QUESTION: ${question}
CONTEXT: ${fullContext.slice(0, 4000)}
ANSWER: ${answer}

Score this answer:`
            }
          ],
        })
      )

      raw = completion.choices[0]?.message?.content?.trim() || ''
      finishReason = completion.choices[0]?.finish_reason
      if (raw) break

      console.error('eval: empty judge response, retrying with bigger budget', {
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
    return {
      score: Math.min(10, Math.max(0, parsed.score)),
      reason: parsed.reason || ''
    }
  } catch (err) {
    console.error('scoreAnswer: failed to parse judge response', {
      error: err instanceof Error ? err.message : err,
      raw,
    })
    return { score: 0, reason: 'Failed to score' }
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

    const results = []
    let totalScore = 0
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
        console.error('eval: still empty answer after retry', {
          question: evalQ.question,
          finishReason: answerFinishReason,
          chunksRetrieved: finalChunks.length,
        })
      }

      const { score, reason } = await scoreAnswer(evalQ.question, answer, context)
      totalScore += score

      const answerLower = answer.toLowerCase()
      const keywordsPassed = evalQ.expectedKeywords.length === 0
        ? true
        : evalQ.expectedKeywords.some(kw => answerLower.includes(kw.toLowerCase()))

      results.push({
        topic: evalQ.topic,
        question: evalQ.question,
        answer,
        score,
        reason,
        avgSimilarity,
        chunksRetrieved: finalChunks.length,
        keywordCheck: keywordsPassed ? 'PASS' : 'FAIL',
      })
    }

    const avgScore = Math.round((totalScore / automatedEvalQuestions.length) * 10) / 10
    const avgChunks = Math.round(totalChunksRetrieved / automatedEvalQuestions.length * 10) / 10
    const passCount = results.filter(r => r.score >= 6).length

    return apiSuccess({
      summary: {
        totalQuestions: automatedEvalQuestions.length,
        averageScore: avgScore,
        passed: passCount,
        failed: automatedEvalQuestions.length - passCount,
        passRate: Math.round(passCount / automatedEvalQuestions.length * 100),
        avgChunksRetrieved: avgChunks,
        grade: avgScore >= 8 ? 'A' : avgScore >= 6 ? 'B' : avgScore >= 4 ? 'C' : 'D',
      },
      results,
    })

  } catch (err) {
    return handleApiError(err, 'eval')
  }
}