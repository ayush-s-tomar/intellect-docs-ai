'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSessionId } from '@/hooks/useSessionId'
import type { RetrievalSummary } from '@/lib/retrievalEval'

interface Item { question: string; fact: string; hybridRank: number | null; vectorRank: number | null }
interface Doc { id: string; name: string }

type RunResponse =
  | { success: true; data: { hybrid: RetrievalSummary; vector: RetrievalSummary; items: Item[] } }
  | { success: false; error: string; code: string }

type DocsResponse =
  | { success: true; data: Doc[] }
  | { success: false; error: string; code: string }

const rankLabel = (r: number | null) => (r === null ? 'miss' : `#${r}`)
const rankColor = (r: number | null) => (r === null ? 'text-red-400' : r === 1 ? 'text-emerald-400' : 'text-blue-400')

export default function RetrievalEvalPage() {
  const sessionId = useSessionId()
  const [docs, setDocs] = useState<Doc[]>([])
  const [documentId, setDocumentId] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ hybrid: RetrievalSummary; vector: RetrievalSummary; items: Item[] } | null>(null)

  useEffect(() => {
    if (!sessionId) return
    fetch('/api/documents', { headers: { 'x-session-id': sessionId } })
      .then(r => r.json())
      .then((res: DocsResponse) => setDocs(res.success ? res.data : []))
      .catch(() => setDocs([]))
  }, [sessionId])

  const run = async () => {
    setRunning(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/eval/retrieval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, document_id: documentId }),
      })
      const data: RunResponse = await res.json()
      if (!data.success) setError(data.error)
      else setResult(data.data)
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setRunning(false)
    }
  }

  const row = (label: string, s: RetrievalSummary) => (
    <tr className="border-t border-slate-800">
      <td className="py-2 pr-4 text-slate-300">{label}</td>
      <td className="py-2 pr-4 text-white font-semibold">{s.hitAt1}%</td>
      <td className="py-2 pr-4 text-white font-semibold">{s.hitAt3}%</td>
      <td className="py-2 pr-4 text-white font-semibold">{s.hitAt5}%</td>
      <td className="py-2 text-white font-semibold">{s.mrr}</td>
    </tr>
  )

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100 font-sans p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Retrieval check</h1>
            <p className="text-sm text-slate-500 mt-1">No LLM involved: hybrid search vs vector-only, same questions.</p>
          </div>
          <Link href="/eval" className="text-xs text-slate-400 hover:text-emerald-400">&larr; Eval</Link>
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 mb-6 text-xs text-slate-400 leading-relaxed">
          Upload <code>samples/company-handbook.txt</code> on the main page, select it below and run. Each of 22 questions has a fact that must
          appear in a retrieved chunk. Hit@k is the share of questions whose fact is in the top k chunks. The handbook is only a few chunks
          long, so hit@1 and hit@3 are the meaningful numbers; hit@5 is close to 100% by construction, and the two methods may tie.
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <select
            value={documentId}
            disabled={running}
            onChange={e => setDocumentId(e.target.value)}
            className="flex-1 min-w-0 truncate bg-[#0d0d14] border border-slate-800 text-slate-200 rounded-xl px-4 py-3 text-sm"
          >
            <option value="">Select the sample handbook...</option>
            {docs.map(d => <option key={d.id} value={d.id}>{d.name} (id: {d.id})</option>)}
          </select>
          <button
            onClick={run}
            disabled={running || !documentId}
            className="px-6 py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-semibold uppercase tracking-wider hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {running ? 'Running...' : 'Run check'}
          </button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm mb-6">{error}</div>}

        {result && (
          <>
            <div className="bg-[#0d0d14] border border-slate-800 rounded-xl p-4 mb-6 overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-[11px] text-slate-400 uppercase tracking-wider">
                    <th className="pb-2 pr-4 font-medium">Method</th>
                    <th className="pb-2 pr-4 font-medium">Hit@1</th>
                    <th className="pb-2 pr-4 font-medium">Hit@3</th>
                    <th className="pb-2 pr-4 font-medium">Hit@5</th>
                    <th className="pb-2 font-medium">MRR</th>
                  </tr>
                </thead>
                <tbody>
                  {row('Hybrid (vector + full-text, RRF)', result.hybrid)}
                  {row('Vector only', result.vector)}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              {result.items.map((it, i) => (
                <div key={i} className="bg-[#0d0d14] border border-slate-800 rounded-lg px-4 py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-300">{it.question}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">expects: {it.fact}</p>
                  </div>
                  <div className="text-xs font-semibold flex-shrink-0 text-right">
                    <p className={rankColor(it.hybridRank)}>hybrid {rankLabel(it.hybridRank)}</p>
                    <p className={rankColor(it.vectorRank)}>vector {rankLabel(it.vectorRank)}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}