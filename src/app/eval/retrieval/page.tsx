'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSessionId } from '@/hooks/useSessionId'
import type { RetrievalSummary } from '@/lib/retrievalEval'

interface Item { question: string; fact: string; rank: number | null }
interface Doc { id: string; name: string }

type RunResponse =
  | { success: true; data: { summary: RetrievalSummary; items: Item[] } }
  | { success: false; error: string; code: string }

type DocsResponse =
  | { success: true; data: Doc[] }
  | { success: false; error: string; code: string }

export default function RetrievalEvalPage() {
  const sessionId = useSessionId()
  const [docs, setDocs] = useState<Doc[]>([])
  const [documentId, setDocumentId] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<RetrievalSummary | null>(null)
  const [items, setItems] = useState<Item[]>([])

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
    setSummary(null)
    setItems([])
    try {
      const res = await fetch('/api/eval/retrieval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, document_id: documentId }),
      })
      const data: RunResponse = await res.json()
      if (!data.success) setError(data.error)
      else {
        setSummary(data.data.summary)
        setItems(data.data.items)
      }
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setRunning(false)
    }
  }

  const tile = (label: string, value: string) => (
    <div className="bg-[#0d0d14] border border-slate-800 rounded-xl p-4 text-center">
      <p className="text-3xl font-bold text-white">{value}</p>
      <p className="text-[11px] text-slate-400 uppercase tracking-wider mt-1">{label}</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100 font-sans p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Retrieval check</h1>
            <p className="text-sm text-slate-500 mt-1">No LLM involved: does the right chunk come back?</p>
          </div>
          <Link href="/eval" className="text-xs text-slate-400 hover:text-emerald-400">&larr; Eval</Link>
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 mb-6 text-xs text-slate-400 leading-relaxed">
          Upload <code>samples/company-handbook.txt</code> on the main page, select it below and run. Each of 22 questions has a fact
          that must appear in a retrieved chunk. Hit@k is the share of questions whose fact is in the top k chunks. The handbook is only
          a few chunks long, so hit@1 and hit@3 are the meaningful numbers; hit@5 is close to 100% by construction.
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

        {summary && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {tile('Hit@1', `${summary.hitAt1}%`)}
              {tile('Hit@3', `${summary.hitAt3}%`)}
              {tile('Hit@5', `${summary.hitAt5}%`)}
              {tile('MRR', String(summary.mrr))}
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="bg-[#0d0d14] border border-slate-800 rounded-lg px-4 py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-300">{it.question}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">expects: {it.fact}</p>
                  </div>
                  <span className={`text-xs font-semibold flex-shrink-0 ${it.rank === null ? 'text-red-400' : it.rank === 1 ? 'text-emerald-400' : 'text-blue-400'}`}>
                    {it.rank === null ? 'miss' : `rank ${it.rank}`}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}