'use client'

import { useState, useEffect, useRef } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: { content: string; document_id: string }[]
}

interface Document {
  id: string
  name: string
  created_at: string
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Welcome. Upload a document, select it from the sidebar, then ask me anything. I'll answer strictly from your document and show you exactly where the answer came from.",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [documents, setDocuments] = useState<Document[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [expandedSource, setExpandedSource] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Fetch documents on load
  useEffect(() => {
    fetchDocuments()
  }, [])

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents')
      const data = await res.json()
      setDocuments(data)
    } catch (err) {
      console.error('Failed to fetch documents:', err)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.success) {
        await fetchDocuments()
        setSelectedDocIds(prev => [...prev, data.document.id])
      } else {
        alert('Upload failed: ' + data.error)
      }
    } catch (err) {
      alert('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleDeleteDocument = async (id: string) => {
    try {
      await fetch('/api/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setDocuments(prev => prev.filter(d => d.id !== id))
      setSelectedDocIds(prev => prev.filter(did => did !== id))
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const toggleDocSelection = (id: string) => {
    setSelectedDocIds(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    )
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return
    if (selectedDocIds.length === 0) {
      alert('Please select at least one document from the sidebar first.')
      return
    }

    const userMsg: Message = { role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          selectedDocIds,
        }),
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let assistantMsg: Message = { role: 'assistant', content: '', sources: [] }
      setMessages(prev => [...prev, assistantMsg])

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          const raw = line.replace('data: ', '')
          if (raw === '[DONE]') break
          try {
            const parsed = JSON.parse(raw)
            if (parsed.sources) {
              assistantMsg = { ...assistantMsg, sources: parsed.sources }
            }
            if (parsed.text) {
              assistantMsg = { ...assistantMsg, content: assistantMsg.content + parsed.text }
            }
            setMessages(prev => [...prev.slice(0, -1), { ...assistantMsg }])
          } catch {}
        }
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: '❌ Something went wrong. Please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-slate-100 font-mono overflow-hidden">

      {/* Sidebar */}
      <aside className="w-72 bg-[#0d0d14] border-r border-slate-800/40 flex flex-col">
        
        {/* Logo */}
        <div className="p-5 border-b border-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-bold tracking-widest text-white uppercase">AskMyDocs</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 tracking-wider">RAG · Groq · Supabase</p>
        </div>

        {/* Upload */}
        <div className="p-4 border-b border-slate-800/40">
          <label className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold tracking-wider uppercase transition-all cursor-pointer border ${
            uploading
              ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
          }`}>
            {uploading ? (
              <>
                <span className="w-3 h-3 border border-slate-500 border-t-transparent rounded-full animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <span className="text-base leading-none">+</span>
                Upload Document
              </>
            )}
            <input
              type="file"
              className="hidden"
              accept=".txt,.pdf,.md"
              disabled={uploading}
              onChange={handleUpload}
            />
          </label>
        </div>

        {/* Document List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-3">
            Documents ({documents.length})
          </p>

          {documents.length === 0 && (
            <div className="text-center py-8">
              <p className="text-xs text-slate-600">No documents yet.</p>
              <p className="text-xs text-slate-700 mt-1">Upload one to get started.</p>
            </div>
          )}

          {documents.map(doc => (
            <div
              key={doc.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all group cursor-pointer ${
                selectedDocIds.includes(doc.id)
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-slate-900/40 border-slate-800/40 hover:border-slate-700/60'
              }`}
              onClick={() => toggleDocSelection(doc.id)}
            >
              {/* Checkbox */}
              <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                selectedDocIds.includes(doc.id)
                  ? 'bg-emerald-500 border-emerald-500'
                  : 'border-slate-600'
              }`}>
                {selectedDocIds.includes(doc.id) && (
                  <svg className="w-2 h-2 text-black" fill="currentColor" viewBox="0 0 12 12">
                    <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                  </svg>
                )}
              </div>

              {/* Name */}
              <span className="text-xs text-slate-300 truncate flex-1 group-hover:text-white transition-colors">
                {doc.name}
              </span>

              {/* Delete */}
              <button
                onClick={e => { e.stopPropagation(); handleDeleteDocument(doc.id) }}
                className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all text-xs leading-none"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800/40">
          <p className="text-[10px] text-slate-600 text-center">
            {selectedDocIds.length} of {documents.length} selected
          </p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">

        {/* Header */}
        <header className="h-14 border-b border-slate-800/40 bg-[#0a0a0f]/80 backdrop-blur flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 uppercase tracking-widest">Workspace</span>
            {selectedDocIds.length > 0 && (
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                {selectedDocIds.length} doc{selectedDocIds.length > 1 ? 's' : ''} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10px] text-slate-500">Connected</span>
          </div>
        </header>

        {/* Messages */}
        <section className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl w-full ${msg.role === 'user' ? 'flex justify-end' : ''}`}>

                {/* Label */}
                <p className={`text-[10px] uppercase tracking-widest mb-1.5 ${
                  msg.role === 'user' ? 'text-right text-slate-600' : 'text-slate-600'
                }`}>
                  {msg.role === 'user' ? 'You' : 'AskMyDocs'}
                </p>

                {/* Bubble */}
                <div className={`px-5 py-4 rounded-xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-slate-800 border border-slate-700/50 text-slate-200 inline-block'
                    : 'bg-[#0d0d14] border border-slate-800/60 text-slate-300 w-full'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* Sources */}
                  {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-800/60 space-y-2">
                      <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-2">
                        Sources ({msg.sources.length} chunks)
                      </p>
                      {msg.sources.map((src, si) => (
                        <div key={si} className="rounded-lg border border-slate-800 overflow-hidden">
                          <button
                            onClick={() => setExpandedSource(expandedSource === si + i * 100 ? null : si + i * 100)}
                            className="w-full flex items-center justify-between px-3 py-2 bg-slate-900/60 hover:bg-slate-900 transition-colors text-left"
                          >
                            <span className="text-[10px] text-emerald-400 uppercase tracking-wider">
                              Chunk {si + 1}
                            </span>
                            <span className="text-[10px] text-slate-600">
                              {expandedSource === si + i * 100 ? '▲ hide' : '▼ show'}
                            </span>
                          </button>
                          {expandedSource === si + i * 100 && (
                            <div className="px-3 py-2 bg-slate-950/60">
                              <p className="text-[11px] text-slate-400 leading-relaxed">
                                {src.content}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#0d0d14] border border-slate-800/60 rounded-xl px-5 py-4">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </section>

        {/* Input */}
        <footer className="p-6 border-t border-slate-800/40 flex-shrink-0">
          <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto flex items-center gap-3">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={selectedDocIds.length === 0 ? "Select a document first..." : "Ask anything about your document..."}
              disabled={loading || selectedDocIds.length === 0}
              className="flex-1 bg-[#0d0d14] border border-slate-800 text-slate-200 rounded-xl px-5 py-3.5 text-sm focus:outline-none focus:border-emerald-500/40 placeholder:text-slate-600 disabled:opacity-40 transition-colors"
            />
            <button
              type="submit"
              disabled={loading || !input.trim() || selectedDocIds.length === 0}
              className="px-5 py-3.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-semibold uppercase tracking-wider hover:bg-emerald-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Send
            </button>
          </form>
          <p className="text-center text-[10px] text-slate-700 mt-3 tracking-wider">
            Answers grounded strictly in your uploaded documents
          </p>
        </footer>
      </main>
    </div>
  )
}