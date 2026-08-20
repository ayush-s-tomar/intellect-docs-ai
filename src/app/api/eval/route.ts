import { NextRequest } from 'next/server'
import Groq from 'groq-sdk'
import { evalQuestions } from '@/lib/evalQuestions'
import { evalRequestSchema, formatZodError } from '@/lib/validation'
import { env } from '@/lib/env'
import { apiSuccess, apiError, handleApiError } from '@/lib/api-response'
import { embedText } from '@/lib/embeddings'
import { searchChunksHybrid, chunksToContext } from '@/lib/chunks-repository'
import { RETRIEVAL } from '@/lib/config'

const groq = new Groq({ apiKey: env.GROQ_API_KEY })

async function scoreAnswer(
  question: string,
  answer: string,
  context: string
): Promise<{ score: number; reason: string }> {
  let raw = ''
  try {
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      temperature: 0,
      max_tokens: 100,
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
CONTEXT: ${context.slice(0, 800)}
ANSWER: ${answer}

Score this answer:`
        }
      ],
    })

    raw = completion.choices[0]?.message?.content?.trim() || ''

    // openai/gpt-oss-20b sometimes wraps JSON in markdown code fences
    // (```json ... ```), which breaks a naive JSON.parse. Strip them
    // before parsing.
    const cleaned = raw.replace(/```json\s*|```\s*/g, '').trim()

    const parsed = JSON.parse(cleaned)
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

    for (const evalQ of evalQuestions) {
      const queryEmbedding = await embedText(evalQ.question)

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

      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-20b',
        temperature: 0.2,
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content: `Answer the question using ONLY the following context.
If the answer is not in the context, say "Not found in document."

CONTEXT:
${context}`
          },
          {
            role: 'user',
            content: evalQ.question
          }
        ],
      })

      const answer = completion.choices[0]?.message?.content?.trim() || ''

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

    const avgScore = Math.round((totalScore / evalQuestions.length) * 10) / 10
    const avgChunks = Math.round(totalChunksRetrieved / evalQuestions.length * 10) / 10
    const passCount = results.filter(r => r.score >= 6).length

    return apiSuccess({
      summary: {
        totalQuestions: evalQuestions.length,
        averageScore: avgScore,
        passed: passCount,
        failed: evalQuestions.length - passCount,
        passRate: Math.round(passCount / evalQuestions.length * 100),
        avgChunksRetrieved: avgChunks,
        grade: avgScore >= 8 ? 'A' : avgScore >= 6 ? 'B' : avgScore >= 4 ? 'C' : 'D',
      },
      results,
    })

  } catch (err) {
    return handleApiError(err, 'eval')
  }
}