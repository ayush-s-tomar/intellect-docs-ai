import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { embedText } from '@/lib/embeddings'
import Groq from 'groq-sdk'
import { evalQuestions } from '@/lib/evalQuestions'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// Uses Groq to score an answer from 0-10
async function scoreAnswer(
  question: string,
  answer: string,
  context: string
): Promise<{ score: number; reason: string }> {
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
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

    const raw = completion.choices[0]?.message?.content?.trim() || ''
    const parsed = JSON.parse(raw)
    return {
      score: Math.min(10, Math.max(0, parsed.score)),
      reason: parsed.reason || ''
    }
  } catch {
    return { score: 0, reason: 'Failed to score' }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { session_id, document_id } = await req.json()

    if (!session_id || !document_id) {
      return NextResponse.json(
        { error: 'session_id and document_id are required' },
        { status: 400 }
      )
    }

    const docId = parseInt(document_id, 10)
    const results = []
    let totalScore = 0
    let totalChunksRetrieved = 0

    for (const evalQ of evalQuestions) {
      // Step 1: embed the question
      const queryEmbedding = await embedText(evalQ.question)

      // Step 2: retrieve relevant chunks (same as chat route)
      const { data: chunks } = await supabaseAdmin.rpc('match_chunks', {
        query_embedding: queryEmbedding,
        match_count: 5,
        filter_session_id: session_id,
        filter_doc_ids: [docId],
      })

      const finalChunks = chunks || []
      totalChunksRetrieved += finalChunks.length

      const context = finalChunks.map((c: any) => c.content).join('\n\n')
        || 'No context found.'

      const avgSimilarity = finalChunks.length > 0
        ? Math.round(
            finalChunks.reduce((sum: number, c: any) => sum + (c.similarity || 0), 0)
            / finalChunks.length * 100
          )
        : 0

      // Step 3: generate answer (non-streaming)
      const completion = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
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

      // Step 4: score the answer
      const { score, reason } = await scoreAnswer(evalQ.question, answer, context)
      totalScore += score

      // Step 5: keyword check
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

    return NextResponse.json({
      summary: {
        totalQuestions: evalQuestions.length,
        averageScore: avgScore,
        passed: passCount,          // score >= 6 counts as pass
        failed: evalQuestions.length - passCount,
        passRate: Math.round(passCount / evalQuestions.length * 100),
        avgChunksRetrieved: avgChunks,
        grade: avgScore >= 8 ? 'A' : avgScore >= 6 ? 'B' : avgScore >= 4 ? 'C' : 'D',
      },
      results,
    })

  } catch (err: any) {
    console.error('❌ EVAL ERROR:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}