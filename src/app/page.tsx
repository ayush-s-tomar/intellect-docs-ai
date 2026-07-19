'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useSessionId } from '@/hooks/useSessionId'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: { content: string; document_id: string; similarity?: number | null }[]
}

interface Document {
  id: string
  name: string
  created_at: string
  word_count?: number
  chunk_count?: number
  summary?: string
}

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'warning'
}

export default function Home() {
  const sessionId = useSessionId()

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Welcome. Upload a document, select it from the sidebar, then ask me anything. I'll answer strictly from your document and show you exactly where the answer came from.",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const [documents, setDocuments] = useState<Document[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [expandedSource, setExpandedSource] = useState<number | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const showToast = (message: string, type: Toast['type'] = 'success', duration = 3000) => {
    const id = toastId.current++
    setToasts(prev => [...prev, { id, message, type }])
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
    }
  }

  const dismissToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents?session_id=${sessionId}`)
      const data = await res.json()
      setDocuments(data)
    } catch (err) {
      console.error('Failed to fetch documents:', err)
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDocuments()
  }, [sessionId, fetchDocuments])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const extractPdfText = async (file: File): Promise<string> => {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    let fullText = ''

    for (let i = 1; i <= pdf.numPages; i++) {
      setUploadProgress(`Reading page ${i} of ${pdf.numPages}...`)
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const pageText = content.items
        .map(item => ('str' in item ? item.str : ''))
        .join(' ')
      fullText += pageText + '\n'
    }

    return fullText
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      showToast('File too large. Please upload a file under 5MB.', 'error', 5000)
      e.target.value = ''
      return
    }

    setUploading(true)
    setUploadProgress('Preparing...')

    try {
      let uploadFile = file

      if (file.type === 'application/pdf') {
        setUploadProgress('Extracting text from PDF...')
        const textContent = await extractPdfText(file)

        if (!textContent.trim()) {
          showToast('Could not extract text from this PDF. It may be a scanned image.', 'error', 5000)
          return
        }

        uploadFile = new File(
          [textContent],
          file.name.replace('.pdf', '.txt'),
          { type: 'text/plain' }
        )
      }

      setUploadProgress('Uploading...')
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('session_id', sessionId)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (data.success) {
        await fetchDocuments()
        setSelectedDocIds(prev => [...prev, data.document.id])
        setDocuments(prev => prev.map(d =>
          d.id === data.document.id
            ? { ...d, word_count: data.wordCount, chunk_count: data.chunksCreated, summary: data.summary }
            : d
        ))
        showToast(`✓ "${file.name}" uploaded — ${data.chunksCreated} chunks indexed`, 'success')
      } else {
        if (data.error?.includes('limit')) {
          showToast('Upload limit reached. Max 5 uploads per hour.', 'warning', 5000)
        } else {
          showToast('Upload failed: ' + data.error, 'error', 5000)
        }
      }
    } catch (err) {
      console.error(err)
      showToast('Upload failed. Check your connection and try again.', 'error', 5000)
    } finally {
      setUploading(false)
      setUploadProgress('')
      e.target.value = ''
    }
  }

  const handleClearAll = async () => {
    if (documents.length === 0) return
    const count = documents.length
    await Promise.all(
      documents.map(doc =>
        fetch(`/api/documents?session_id=${sessionId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: doc.id }),
        })
      )
    )
    setDocuments([])
    setSelectedDocIds([])
    showToast(`${count} document${count > 1 ? 's' : ''} deleted`, 'success')
  }

  const handleDeleteDocument = async (id: string) => {
    try {
      await fetch(`/api/documents?session_id=${sessionId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setDocuments(prev => prev.filter(d => d.id !== id))
      setSelectedDocIds(prev => prev.filter(did => did !== id))
      showToast('Document deleted', 'success', 2000)
    } catch (err) {
      console.error('Delete failed:', err)
      showToast('Delete failed. Please try again.', 'error', 4000)
    }
  }

  const toggleDocSelection = (id: string) => {
    setSelectedDocIds(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    )
  }

  const handleExportChat = () => {
    if (messages.length <= 1) return

    // eslint-disable-next-line react-hooks/purity
    const timestamp = Date.now()
    const lines: string[] = []
    lines.push('AskMyDocs - Chat Export')
    lines.push('========================')
    lines.push(`Date: ${new Date().toLocaleDateString()}`)
    lines.push('')

    messages.forEach(msg => {
      lines.push(msg.role === 'user' ? 'You:' : 'AskMyDocs:')
      lines.push(msg.content)
      lines.push('')
    })

    lines.push('========================')
    lines.push('Exported from AskMyDocs — intellect-docs-ai.vercel.app')

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `askmydocs-chat-${timestamp}.txt`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Chat exported successfully', 'success', 2000)
  }

  const handleCopy = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return
    if (selectedDocIds.length === 0) {
      showToast('Please select a document from the sidebar first.', 'warning', 3000)
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
          session_id: sessionId,
        }),
      })

      if (res.status === 429) {
        showToast('Too many requests. Please wait a minute before asking again.', 'warning', 5000)
        setLoading(false)
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      const assistantMsg: Message = { role: 'assistant', content: '', sources: [] }
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
            setMessages(prev => {
              const last = prev[prev.length - 1]
              const updated: Message = {
                ...last,
                sources: parsed.sources ?? last.sources,
                content: parsed.text ? last.content + parsed.text : last.content,
              }
              return [...prev.slice(0, -1), updated]
            })
          } catch {
            // ignore malformed SSE chunk
          }
        }
      }
    } catch (err) {
      console.error('Chat request failed:', err)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: '❌ Something went wrong. Please try again.' },
      ])
      showToast('Connection error. Please try again.', 'error', 4000)
    } finally {
      setLoading(false)
    }
  }

  const getFileIcon = (name: string) => {
    if (name.endsWith('.pdf') || name.endsWith('.txt')) return '📄'
    if (name.endsWith('.md')) return '📝'
    return '📃'
  }

  const toastStyles = {
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    error: 'bg-red-500/10 border-red-500/30 text-red-400',
    warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  }

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-slate-100 font-mono overflow-hidden">

      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl border text-xs tracking-wide transition-all ${toastStyles[toast.type]}`}
          >
            <span>{toast.message}</span>
            <button
              onClick={() => dismissToast(toast.id)}
              className="opacity-60 hover:opacity-100 text-sm leading-none flex-shrink-0 mt-0.5"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed md:relative z-30 md:z-auto
        w-72 h-full
        bg-[#0d0d14] border-r border-slate-800/40
        flex flex-col
        transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>

        <div className="p-5 border-b border-slate-800/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-bold tracking-widest text-white uppercase">AskMyDocs</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden text-slate-500 hover:text-white text-lg leading-none"
            >
              ✕
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 tracking-wider">RAG · Groq · Supabase</p>
        </div>

        <div className="p-4 border-b border-slate-800/40">
          <label className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold tracking-wider uppercase transition-all cursor-pointer border ${
            uploading
              ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
          }`}>
            {uploading ? (
              <div className="flex flex-col items-center gap-1 py-0.5">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 border border-slate-500 border-t-transparent rounded-full animate-spin" />
                  <span>Processing...</span>
                </div>
                {uploadProgress && (
                  <span className="text-[9px] text-slate-600 tracking-wider normal-case">
                    {uploadProgress}
                  </span>
                )}
              </div>
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

          {!uploading && (
            <p className="text-[9px] text-slate-700 text-center mt-2 tracking-wider">
              TXT · PDF · MD · Max 5MB
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
              Documents ({documents.length})
            </p>
            {documents.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-[9px] uppercase tracking-wider text-slate-600 hover:text-red-400 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

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

              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-xs text-slate-300 truncate group-hover:text-white transition-colors">
                  {getFileIcon(doc.name)} {doc.name}
                </span>
                {doc.word_count && (
                  <span className="text-[9px] text-slate-600 mt-0.5">
                    {doc.word_count.toLocaleString()} words · {doc.chunk_count} chunks
                  </span>
                )}
                {doc.summary && (
                  <span className="text-[9px] text-slate-500 mt-1 leading-relaxed line-clamp-2">
                    {doc.summary}
                  </span>
                )}
              </div>

              <button
                onClick={e => { e.stopPropagation(); handleDeleteDocument(doc.id) }}
                className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all text-xs leading-none"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-800/40">
          <p className="text-[10px] text-slate-600 text-center">
            {selectedDocIds.length} of {documents.length} selected
          </p>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden">

        <header className="h-14 border-b border-slate-800/40 bg-[#0a0a0f]/80 backdrop-blur flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden text-slate-500 hover:text-white transition-colors mr-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-xs text-slate-500 uppercase tracking-widest">Workspace</span>
            {selectedDocIds.length > 0 && (
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                {selectedDocIds.length} doc{selectedDocIds.length > 1 ? 's' : ''} active
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {messages.length > 1 && (
              <button
                onClick={handleExportChat}
                className="text-[10px] uppercase tracking-wider text-slate-500 hover:text-emerald-400 border border-slate-800 hover:border-emerald-500/30 px-3 py-1.5 rounded-lg transition-all"
              >
                Export Chat
              </button>
            )}
            <Link
              href="/eval"
              className="text-[10px] uppercase tracking-wider text-slate-600 hover:text-emerald-400 transition-colors"
            >
              Eval
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] text-slate-500">Connected</span>
            </div>
          </div>
        </header>

        <section className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-2xl w-full ${msg.role === 'user' ? 'flex justify-end' : ''}`}>

                  <p className={`text-[10px] uppercase tracking-widest mb-1.5 ${
                    msg.role === 'user' ? 'text-right text-slate-600' : 'text-slate-600'
                  }`}>
                    {msg.role === 'user' ? 'You' : 'AskMyDocs'}
                  </p>

                  <div className={`px-5 py-4 rounded-xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-slate-800 border border-slate-700/50 text-slate-200 inline-block'
                      : 'bg-[#0d0d14] border border-slate-800/60 text-slate-300 w-full'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {msg.role === 'assistant' && msg.content && (
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => handleCopy(msg.content, i)}
                          className="text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all border-slate-700 text-slate-500 hover:text-emerald-400 hover:border-emerald-500/30"
                        >
                          {copiedIndex === i ? '✓ Copied!' : 'Copy'}
                        </button>
                      </div>
                    )}

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
                              <span className="text-[10px] text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                                Chunk {si + 1}
                                {src.similarity && (
                                  <span className="flex items-center gap-1.5 normal-case tracking-normal">
                                    <span className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                                      <span
                                        className="h-full bg-emerald-400 block"
                                        style={{ width: `${Math.min(src.similarity, 100)}%` }}
                                      />
                                    </span>
                                    <span className="text-slate-500">{src.similarity}%</span>
                                  </span>
                                )}
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
          </div>
        </section>

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