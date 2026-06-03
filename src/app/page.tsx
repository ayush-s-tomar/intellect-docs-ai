'use client'

import { useState } from 'react'

export default function Home() {
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
          {/* Header Branding */}
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
          <button className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] text-white font-medium text-sm rounded-xl shadow-lg shadow-blue-600/10 transition-all duration-200 flex items-center justify-center space-x-2 border border-blue-400/20">
            <span className="text-base font-bold">+</span>
            <span>Upload Document</span>
          </button>

          <hr className="border-slate-800/60" />

          {/* Document Inventory List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-1">Active Indexes</p>
            
            <div className="flex items-center justify-between p-3.5 bg-slate-900/60 border border-slate-800 hover:border-slate-700/80 rounded-xl transition duration-150 group">
              <div className="flex items-center space-x-3 min-w-0">
                <input 
                  type="checkbox" 
                  defaultChecked 
                  className="w-4 h-4 rounded-md border-slate-700 text-blue-600 bg-slate-950 focus:ring-blue-500/20 transition cursor-pointer" 
                />
                <span className="text-sm font-medium text-slate-300 truncate max-w-[170px] group-hover:text-slate-200">
                  test-document.txt
                </span>
              </div>
              <button className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition duration-150 p-1 text-xs">
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* User Footnote */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800/40 text-center">
          <p className="text-[11px] text-slate-500">Connected to Supabase & Groq AI</p>
        </div>
      </aside>

      {/* 2. Main Studio Workspace */}
      <main className="flex-1 flex flex-col h-full bg-slate-900 relative">
        
        {/* Top Navbar Header */}
        <header className="h-16 border-b border-slate-800/40 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-8 z-10">
          <div className="flex items-center space-x-3">
            <h1 className="text-sm font-semibold text-slate-200 tracking-wide">Workspace Console</h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full font-medium border border-emerald-500/10 flex items-center space-x-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
              <span>Pipeline Online</span>
            </span>
          </div>
        </header>

        {/* 3. Infinite Stream Chat Box */}
        <section className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 max-w-4xl w-full mx-auto custom-scrollbar">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl px-5 py-4 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white font-medium rounded-tr-none shadow-md shadow-blue-600/5' 
                  : 'bg-slate-950 border border-slate-800/80 text-slate-200 rounded-tl-none shadow-sm'
              }`}>
                <span className={`block text-[10px] uppercase font-bold tracking-wider mb-1 opacity-50 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  {msg.role === 'user' ? 'You' : 'Assistant Context Model'}
                </span>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {/* Loading Indicator */}
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

        {/* 4. Grounded Vector Source Chunks Display */}
        {chunks.length > 0 && (
          <section className="max-w-4xl w-full mx-auto px-6 md:px-10 pb-2">
            <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                  {/* Cleaned up secure icon indicator */}
                  <span className="text-blue-400 text-sm font-bold">📂</span>
                  <span>Retrieved Knowledge Chunks ({chunks.length})</span>
                </h4>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {chunks.map((c, idx) => (
                  <div key={c.id || idx} className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-xs text-slate-300 leading-relaxed hover:border-slate-700/60 transition group relative overflow-hidden">
                    <span className="font-bold text-blue-400 block mb-1 text-[10px] uppercase tracking-wide">
                      Context Block #{idx + 1}
                    </span>
                    <p className="text-slate-400 line-clamp-3 group-hover:text-slate-300 transition">
                      {c.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 5. Message Input Footer Controller */}
        <footer className="p-6 md:p-10 bg-gradient-to-t from-slate-950/40 via-slate-900 to-transparent">
          <form onSubmit={handleSendMessage} className="max-w-4xl w-full mx-auto relative flex items-center">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Query your indexed technical documents..." 
              disabled={loading}
              className="w-full bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 rounded-xl pl-5 pr-20 py-4 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-inner transition disabled:opacity-50"
            />
            <button 
              type="submit" 
              disabled={loading || !input.trim()}
              className="absolute right-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white font-medium text-xs rounded-lg transition duration-150 border border-blue-400/20 shadow-md"
            >
              Execute
            </button>
          </form>
          <p className="text-center text-[10px] text-slate-600 mt-3 tracking-wide">
            Grounded Generation Interface • Build Optimized Vectors to Prevent Hallucinations
          </p>
        </footer>

      </main>
    </div>
  )
}