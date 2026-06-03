'use client'

import { useState, useRef } from 'react' // 1. Added useRef here

export default function Home() {
  // 2. Added this line so the button has something to "click"
  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Core State Hooks ---
  const [messages, setMessages] = useState<any[]>([
    { role: 'assistant', content: "Hello! Upload a document to your Knowledge Base, select it, and ask me anything. I will answer based strictly on the context chunks retrieved from your database." }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [chunks, setChunks] = useState<any[]>([
    { id: 1, content: "Retrieval Augmented Generation (RAG) optimizes LLM outputs by querying custom vector databases before generating a response." }
  ]) 
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([1])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMsg = { role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'This is a beautifully optimized response rendering seamlessly inside your newly designed premium chat container!' 
      }])
      setLoading(false)
    }, 1200)
  }

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans antialiased selection:bg-blue-500/30">
      
      {/* 1. Left Navigation Sidebar */}
      <aside className="w-80 bg-slate-950 border-r border-slate-800/60 flex flex-col justify-between hidden md:flex">
        <div className="p-6 space-y-6 flex-1 flex flex-col min-h-0">
          <div>
            <div className="flex items-center space-x-2">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
              <h2 className="text-lg font-bold tracking-tight text-white">
                RAG Engine <span className="text-xs text-blue-400 font-medium px-1.5 py-0.5 rounded-md bg-blue-500/10 ml-1">v1.0</span>
              </h2>
            </div>
            <p className="text-xs text-slate-400/80 mt-1.5">Contextual Knowledge Repository</p>
          </div>

          {/* Upload Primary Button */}
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] text-white font-medium text-sm rounded-xl shadow-lg shadow-blue-600/10 transition-all duration-200 flex items-center justify-center space-x-2 border border-blue-400/20"
          >
            <span className="text-base font-bold">+</span>
            <span>Upload Document</span>
          </button>

          {/* Hidden File Picker Trigger */}
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                console.log("File picked successfully:", file.name);
              }
            }} 
          />

          <hr className="border-slate-800/60" />

          {/* Document Inventory List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-1">Active Indexes</p>
            <div className="flex items-center justify-between p-3.5 bg-slate-900/60 border border-slate-800 hover:border-slate-700/80 rounded-xl transition duration-150 group">
              <div className="flex items-center space-x-3 min-w-0">
                <input type="checkbox" defaultChecked className="w-4 h-4 rounded-md border-slate-700 text-blue-600 bg-slate-950 focus:ring-blue-500/20 transition cursor-pointer" />
                <span className="text-sm font-medium text-slate-300 truncate max-w-[170px] group-hover:text-slate-200">test-document.txt</span>
              </div>
              <button className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition duration-150 p-1 text-xs">✕</button>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-950/80 border-t border-slate-800/40 text-center">
          <p className="text-[11px] text-slate-500">Connected to Supabase & Groq AI</p>
        </div>
      </aside>

      {/* Main Studio Workspace - (Rest of your original code remains same below) */}
      <main className="flex-1 flex flex-col h-full bg-slate-900 relative">
        <header className="h-16 border-b border-slate-800/40 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-8 z-10">
          <h1 className="text-sm font-semibold text-slate-200 tracking-wide">Workspace Console</h1>
          <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full font-medium border border-emerald-500/10 flex items-center space-x-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
            <span>Pipeline Online</span>
          </span>
        </header>

        <section className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 max-w-4xl w-full mx-auto custom-scrollbar">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl px-5 py-4 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-blue-600 text-white font-medium rounded-tr-none shadow-md' : 'bg-slate-950 border border-slate-800/80 text-slate-200 rounded-tl-none'}`}>
                <span className={`block text-[10px] uppercase font-bold tracking-wider mb-1 opacity-50 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  {msg.role === 'user' ? 'You' : 'Assistant Context Model'}
                </span>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-950 border border-slate-800/80 text-slate-400 px-5 py-4 rounded-2xl rounded-tl-none text-sm flex items-center space-x-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" />
              </div>
            </div>
          )}
        </section>

        {chunks.length > 0 && (
          <section className="max-w-4xl w-full mx-auto px-6 md:px-10 pb-2">
            <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4 backdrop-blur-sm">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">📂 Retrieved Knowledge Chunks ({chunks.length})</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {chunks.map((c, idx) => (
                  <div key={idx} className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-xs text-slate-300">
                    <span className="font-bold text-blue-400 block mb-1 text-[10px] uppercase">Context Block #{idx + 1}</span>
                    <p className="text-slate-400 line-clamp-3">{c.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <footer className="p-6 md:p-10 bg-gradient-to-t from-slate-950/40 via-slate-900 to-transparent">
          <form onSubmit={handleSendMessage} className="max-w-4xl w-full mx-auto relative flex items-center">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Query your indexed technical documents..." disabled={loading} className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl pl-5 pr-20 py-4 text-sm focus:outline-none focus:border-blue-500" />
            <button type="submit" disabled={loading || !input.trim()} className="absolute right-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium text-xs rounded-lg transition">Execute</button>
          </form>
        </footer>
      </main>
    </div>
  )
}