'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSessionId } from '@/hooks/useSessionId'
import Link from 'next/link'
import { automatedEvalQuestions } from '@/lib/evalQuestions'
import { summarizeEval, type CheckResult } from '@/lib/evalSummary'

interface EvalResult {
  topic: string
  question: string
  answer: string
  score: number | null
  reason: string
  avgSimilarity: number
  chunksRetrieved: number
  check: CheckResult
}

type QuestionApiResponse =
  | { success: true; data: { row: EvalResult; total: number } }
  | { success: false; error: string; code: string }

interface Document {
  id: string
  name: string
}

type DocumentsApiResponse =
  | { success: true; data: Document[] }
  | { success: false; error: string; code: string }

const TOTAL = automatedEvalQuestions.length

export default function EvalPage() {
  const sessionId = useSessionId()
  const [documentId, setDocumentId] = useState('')
  const [documents, setDocuments] = useState<Document[]>([])
  const [running, setRunning] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [results, setResults] = useState<EvalResult[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!sessionId) return
    fetch('/api/documents', { headers: { 'x-session-id': sessionId } })
      .then(r => r.json())
      .then((res: DocumentsApiResponse) => {
        setDocuments(res.success ? res.data : [])
      })
      .catch(() => setDocuments([]))
  }, [sessionId])

  const summary = useMemo(() => summarizeEval(results, TOTAL), [results])
  const complete = results.length === TOTAL

  // One question per request. A dropped connection gets one retry.
  const fetchQuestion = async (index: number): Promise<QuestionApiResponse> => {
    const body = JSON.stringify({
      session_id: sessionId,
      document_id: documentId.trim(),
      question_index: index,
    })
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch('/api/eval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
        return (await res.json()) as QuestionApiResponse
      } catch (err) {
        if (attempt === 1) throw err
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
    throw new Error('unreachable')
  }

  const runEval = async () => {
    if (!documentId.trim()) {
      setError('Please select a document first')
      return
    }
    setRunning(true)
    setError('')
    setResults([])
    setCurrentIndex(0)

    const collected: EvalResult[] = []
    try {
      for (let i = 0; i < TOTAL; i++) {
        setCurrentIndex(i)
        const data = await fetchQuestion(i)
        if (!data.success) {
          setError(
            collected.length > 0
              ? `${data.error} Showing the ${collected.length} question(s) completed so far.`
              : data.error
          )
          break
        }
        collected.push(data.data.row)
        setResults([...collected])
      }
    } catch (err) {
      console.error(err)
      setError(
        collected.length > 0
          ? `Connection lost. Showing the ${collected.length} question(s) completed so far.`
          : 'Could not reach the server. Please try again.'
      )
    } finally {
      setRunning(false)
    }
  }

  const gradeColor = (grade: string) => {
    if (grade === 'A') return 'text-emerald-400'
    if (grade === 'B') return 'text-blue-400'
    if (grade === 'C') return 'text-amber-400'
    return 'text-red-400'
  }

  const scoreColor = (score: number | null) => {
    if (score === null) return 'text-slate-500'
    if (score >= 8) return 'text-emerald-400'
    if (score >= 6) return 'text-blue-400'
    if (score >= 4) return 'text-amber-400'
    return 'text-red-400'
  }

  const checkColor = (check: CheckResult) => {
    if (check === 'PASS') return 'text-emerald-500'
    if (check === 'FAIL') return 'text-red-400'
    return 'text-slate-400'
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100 font-sans p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">

        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-slate-500 uppercase tracking-widest">
                  AskMyDocs
                </span>
              </div>
              <h1 className="text-2xl font-bold text-white">RAG Eval Suite</h1>
              <p className="text-sm text-slate-500 mt-1">
                Regression check for retrieval and answer quality
              </p>
            </div>
            <Link
              href="/"
              className="text-xs text-slate-400 hover:text-emerald-400 transition-colors"
            >
              &larr; Back
            </Link>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 mb-6 text-xs text-slate-500 leading-relaxed">
          <p className="text-slate-400 font-semibold mb-1">How to use:</p>
          <p>1. Upload a document on the <Link href="/" className="text-emerald-400 hover:underline">main page</Link></p>
          <p>2. Come back here and select it from the dropdown below</p>
          <p>3. Click Run Eval. Questions run one at a time and results appear as they finish (about 1-2 minutes in total)</p>
          <p className="mt-2 text-slate-400">
            Scores are 0-10 from an LLM judge in the same model family as the answerer, so treat them as a regression signal, not an independent benchmark. Deterministic checks need no LLM. Grade A = 8+, B = 6-8, C = 4-6, D = below 4.
          </p>
        </div>

        <p className="text-xs text-slate-400 mb-4">
          Also available: the <Link href="/eval/retrieval" className="text-emerald-400 hover:underline">retrieval check</Link> (no LLM, no Groq tokens).
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          {documents.length === 0 ? (
            <div className="flex-1 bg-[#0d0d14] border border-slate-800 text-slate-400 rounded-xl px-4 py-3 text-sm">
              {sessionId ? 'No documents found — upload one first' : 'Loading...'}
            </div>
          ) : (
            <select
              value={documentId}
              disabled={running}
              onChange={e => {
                setDocumentId(e.target.value)
                setResults([])
                setError('')
              }}
              className="flex-1 min-w-0 truncate bg-[#0d0d14] border border-slate-800 text-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/40"
            >
              <option value="">Select a document to evaluate...</option>
              {documents.map(doc => (
                <option key={doc.id} value={doc.id}>
                  {doc.name} (id: {doc.id})
                </option>
              ))}
            </select>
          )}
          <button
            onClick={runEval}
            disabled={running || !documentId}
            className="px-6 py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-semibold uppercase tracking-wider hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {running ? 'Running...' : 'Run Eval'}
          </button>
        </div>

        {running && (
          <div className="bg-[#0d0d14] border border-slate-800 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>
                Question {currentIndex + 1} of {TOTAL}: {automatedEvalQuestions[currentIndex]?.topic}
              </span>
              <span>{results.length} done</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-500"
                style={{ width: `${(results.length / TOTAL) * 100}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {summary && (
          <div className="space-y-6">

            {!complete && !running && (
              <p className="text-[11px] text-amber-500 text-center">
                Partial result: {results.length} of {TOTAL} questions completed.
              </p>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#0d0d14] border border-slate-800 rounded-xl p-4 text-center">
                <p className={`text-3xl font-bold ${gradeColor(summary.grade)}`}>
                  {summary.grade}
                </p>
                <p className="text-[11px] text-slate-400 uppercase tracking-wider mt-1">Grade</p>
              </div>
              <div className="bg-[#0d0d14] border border-slate-800 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-white">
                  {summary.averageScore}
                  <span className="text-lg text-slate-500">/10</span>
                </p>
                <p className="text-[11px] text-slate-400 uppercase tracking-wider mt-1">Avg Score</p>
              </div>
              <div className="bg-[#0d0d14] border border-slate-800 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-emerald-400">
                  {summary.passRate}
                  <span className="text-lg text-slate-500">%</span>
                </p>
                <p className="text-[11px] text-slate-400 uppercase tracking-wider mt-1">Pass Rate</p>
              </div>
              <div className="bg-[#0d0d14] border border-slate-800 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-blue-400">
                  {summary.passed}
                  <span className="text-lg text-slate-500">/{summary.scored}</span>
                </p>
                <p className="text-[11px] text-slate-400 uppercase tracking-wider mt-1">Passed (6+)</p>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 text-center">
              Deterministic checks: {summary.checksPassed}/{summary.checksTotal} passed
              {summary.unscored > 0 && (
                <span className="text-amber-500"> · {summary.unscored} question(s) unscored (judge call failed, excluded from average)</span>
              )}
            </p>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-3 mt-6">
            <p className="text-[11px] text-slate-400 uppercase tracking-widest">
              Question Results
            </p>
            {results.map((r, i) => (
              <div key={i} className="bg-[#0d0d14] border border-slate-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">
                      {r.topic}
                    </p>
                    <p className="text-sm text-slate-300">{r.question}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-2xl font-bold ${scoreColor(r.score)}`}>
                      {r.score === null ? '—' : r.score}<span className="text-sm text-slate-500">/10</span>
                    </p>
                    <p className={`text-[11px] uppercase tracking-wider ${checkColor(r.check)}`}>
                      check: {r.check.toLowerCase()}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-950/60 rounded-lg p-3 mb-2">
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">
                    Answer
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{r.answer}</p>
                </div>

                <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
                  <span>Judge: {r.reason}</span>
                  <span className="flex-shrink-0">{r.chunksRetrieved} chunks · {r.avgSimilarity}% avg match</span>
                </div>
              </div>
            ))}

            {!running && (
              <div className="text-center pt-2">
                <button
                  onClick={() => { setResults([]); setDocumentId(''); setError('') }}
                  className="text-xs text-slate-400 hover:text-emerald-400 transition-colors"
                >
                  &larr; Run another eval
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}