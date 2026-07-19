'use client'

import { useState, useEffect } from 'react'
import { useSessionId } from '@/hooks/useSessionId'

interface EvalResult {
  topic: string
  question: string
  answer: string
  score: number
  reason: string
  avgSimilarity: number
  chunksRetrieved: number
  keywordCheck: string
}

interface EvalSummary {
  totalQuestions: number
  averageScore: number
  passed: number
  failed: number
  passRate: number
  avgChunksRetrieved: number
  grade: string
}

interface EvalResponse {
  summary: EvalSummary
  results: EvalResult[]
}

interface Document {
  id: string
  name: string
}

export default function EvalPage() {
  const sessionId = useSessionId()
  const [documentId, setDocumentId] = useState('')
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<EvalResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!sessionId) return
    fetch(`/api/documents?session_id=${sessionId}`)
      .then(r => r.json())
      .then(data => setDocuments(data || []))
      .catch(() => setDocuments([]))
  }, [sessionId])

  const runEval = async () => {
    if (!documentId.trim()) {
      setError('Please select a document first')
      return
    }
    setLoading(true)
    setError('')
    setReport(null)

    try {
      const res = await fetch('/api/eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          document_id: documentId.trim(),
        }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setReport(data)
      }
    } catch (err) {
      console.error(err)
      setError('Eval failed. Check console for details.')
    } finally {
      setLoading(false)
    }
  }

  const gradeColor = (grade: string) => {
    if (grade === 'A') return 'text-emerald-400'
    if (grade === 'B') return 'text-blue-400'
    if (grade === 'C') return 'text-amber-400'
    return 'text-red-400'
  }

  const scoreColor = (score: number) => {
    if (score >= 8) return 'text-emerald-400'
    if (score >= 6) return 'text-blue-400'
    if (score >= 4) return 'text-amber-400'
    return 'text-red-400'
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100 font-mono p-6">
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
                Automatically test your pipeline quality with scored questions
              </p>
            </div>
            
              href="/"
              className="text-xs text-slate-600 hover:text-emerald-400 transition-colors"
            >
              ← Back
            </a>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 mb-6 text-xs text-slate-500 leading-relaxed">
          <p className="text-slate-400 font-semibold mb-1">How to use:</p>
          <p>1. Upload a document on the <a href="/" className="text-emerald-400 hover:underline">main page</a></p>
          <p>2. Come back here and select it from the dropdown below</p>
          <p>3. Click Run Eval and wait ~30-60 seconds for results</p>
          <p className="mt-2 text-slate-600">
            Scores are 0-10. Grade A = 8+, B = 6-8, C = 4-6, D = below 4.
          </p>
        </div>

        <div className="flex gap-3 mb-8">
          {documents.length === 0 ? (
            <div className="flex-1 bg-[#0d0d14] border border-slate-800 text-slate-600 rounded-xl px-4 py-3 text-sm">
              {sessionId ? 'No documents found — upload one first' : 'Loading...'}
            </div>
          ) : (
            <select
              value={documentId}
              onChange={e => {
                setDocumentId(e.target.value)
                setReport(null)
                setError('')
              }}
              className="flex-1 bg-[#0d0d14] border border-slate-800 text-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/40"
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
            disabled={loading || !documentId}
            className="px-6 py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-semibold uppercase tracking-wider hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Running...' : 'Run Eval'}
          </button>
        </div>

        {loading && (
          <div className="bg-[#0d0d14] border border-slate-800 rounded-xl p-6 text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="text-xs text-slate-500">
              Running 5 eval questions... this takes ~30-60 seconds
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {report && (
          <div className="space-y-6">

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#0d0d14] border border-slate-800 rounded-xl p-4 text-center">
                <p className={`text-3xl font-bold ${gradeColor(report.summary.grade)}`}>
                  {report.summary.grade}
                </p>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider mt-1">Grade</p>
              </div>
              <div className="bg-[#0d0d14] border border-slate-800 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-white">
                  {report.summary.averageScore}
                  <span className="text-lg text-slate-500">/10</span>
                </p>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider mt-1">Avg Score</p>
              </div>
              <div className="bg-[#0d0d14] border border-slate-800 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-emerald-400">
                  {report.summary.passRate}
                  <span className="text-lg text-slate-500">%</span>
                </p>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider mt-1">Pass Rate</p>
              </div>
              <div className="bg-[#0d0d14] border border-slate-800 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-blue-400">
                  {report.summary.passed}
                  <span className="text-lg text-slate-500">/{report.summary.totalQuestions}</span>
                </p>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider mt-1">Passed</p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] text-slate-600 uppercase tracking-widest">
                Question Results
              </p>
              {report.results.map((r, i) => (
                <div key={i} className="bg-[#0d0d14] border border-slate-800 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">
                        {r.topic}
                      </p>
                      <p className="text-sm text-slate-300">{r.question}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-2xl font-bold ${scoreColor(r.score)}`}>
                        {r.score}<span className="text-sm text-slate-500">/10</span>
                      </p>
                      <p className={`text-[10px] uppercase tracking-wider ${
                        r.keywordCheck === 'PASS' ? 'text-emerald-500' : 'text-red-500'
                      }`}>
                        {r.keywordCheck}
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-950/60 rounded-lg p-3 mb-2">
                    <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">
                      Answer
                    </p>
                    <p className="text-xs text-slate-400 leading-relaxed">{r.answer}</p>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-600">
                    <span>Judge: {r.reason}</span>
                    <span>{r.chunksRetrieved} chunks · {r.avgSimilarity}% avg match</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center pt-2">
              <button
                onClick={() => { setReport(null); setDocumentId('') }}
                className="text-xs text-slate-600 hover:text-emerald-400 transition-colors"
              >
                ← Run another eval
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}