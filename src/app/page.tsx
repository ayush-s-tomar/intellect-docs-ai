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

          {/* Upload Button: Now wrapped in a label so it works automatically */}
          <label className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] text-white font-medium text-sm rounded-xl shadow-lg shadow-blue-600/10 transition-all duration-200 flex items-center justify-center space-x-2 border border-blue-400/20 cursor-pointer">
            <span className="text-base font-bold">+</span>
            <span>Upload Document</span>
            <input 
              type="file" 
              className="hidden" 
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  console.log("File picked successfully:", file.name);
                  alert("File selected: " + file.name);
                }
              }} 
            />
          </label>

          <hr className="border-slate-800/60" />

          {/* Document Inventory List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-1">Active Indexes</p>
            <div className="flex items-center justify-between p-3.5 bg-slate-900/60 border border-slate-800 hover:border-slate-700/80 rounded-xl transition duration-150 group">
              <div className="flex items-center space-x-3 min-w-0">
                <input type="checkbox" defaultChecked className="w-4 h-4 rounded-md border-slate-700 text-blue-600 bg-slate-950 focus:ring-blue-500/20 transition cursor-pointer" />
                <span className="text-sm font-medium text-slate-300 truncate max-w-[170px] group-hover:text-slate-200">test-document.txt</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-950/80 border-t border-slate-800/40 text-center">
          <p className="text-[11px] text-slate-500">Connected to Supabase & Groq AI</p>
        </div>
      </aside>

      {/* Main Studio Workspace */}
      <main className="flex-1 flex flex-col h-full bg-slate-900 relative">
        <header className="h-16 border-b border-slate-800/40 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-8 z-10">
          <h1 className="text-sm font-semibold text-slate-200 tracking-wide">Workspace Console</h1>
        </header>

        <section className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 max-w-4xl w-full mx-auto custom-scrollbar">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl px-5 py-4 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-950 border border-slate-800/80 text-slate-200 rounded-tl-none'}`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
        </section>

        <footer className="p-6 md:p-10 bg-gradient-to-t from-slate-950/40 via-slate-900 to-transparent">
          <form onSubmit={handleSendMessage} className="max-w-4xl w-full mx-auto relative flex items-center">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Query your indexed technical documents..." disabled={loading} className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl pl-5 pr-20 py-4 text-sm focus:outline-none" />
            <button type="submit" className="absolute right-3 px-4 py-2 bg-blue-600 text-white font-medium text-xs rounded-lg">Execute</button>
          </form>
        </footer>
      </main>
    </div>
  )
}