# AskMyDocs — AI Document Q&A Tool
> Upload any document and ask questions about it. The AI answers strictly from your document and shows exactly which part of the document the answer came from.

🔗 **Live Demo:** https://intellect-docs-ai.vercel.app

---

## What it does
- 📄 Upload any `.txt` or `.pdf` document
- ✅ Select it from the sidebar
- 💬 Ask any question about it in natural language
- 🤖 Get an AI-powered answer based strictly on your document
- 🔍 See exactly which chunks of the document the answer came from
- 🗑️ Delete documents when no longer needed
- ⚡ Real-time streaming responses powered by Groq

---

## Tech Stack
| Layer | Tech |
|-------|------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| AI / LLM | Groq API (LLaMA 3.1 8B Instant) |
| Database | Supabase (PostgreSQL + pgvector) |
| Text Search | Supabase full-text search |
| Rate Limiting | Upstash Redis |
| Deployment | Vercel |

---

## How it works
1. User uploads a document
2. The backend splits it into chunks of ~500 characters
3. Chunks are stored in Supabase with their index
4. When a question is asked, the app searches for relevant chunks using full-text search
5. The top matching chunks are sent to Groq AI as context
6. Groq streams back an answer based strictly on those chunks
7. The UI shows the answer + the source chunks it came from

---

## Project Structure
```
src/
├── app/
│   ├── api/
│   │   ├── chat/        # Streaming AI responses via Groq
│   │   ├── documents/   # Fetch and delete documents
│   │   └── upload/      # File upload, chunking, storage
│   └── page.tsx         # Main UI
└── lib/
    ├── supabase.ts      # Supabase client
    ├── embeddings.ts    # Text processing
    └── chunker.ts       # Document chunking logic
```

---

## How to run locally

### 1. Clone the repo
```bash
git clone https://github.com/ayush-s-tomar/intellect-docs-ai.git
cd intellect-docs-ai
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment variables
Create a `.env.local` file in the root folder:
```
GROQ_API_KEY=your_groq_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Get your keys from:
- Groq API key → [console.groq.com](https://console.groq.com)
- Supabase keys → [supabase.com](https://supabase.com) → your project → Settings → API

### 4. Run the development server
```bash
npm run dev
```

### 5. Open in browser
http://localhost:3000

---

## Deployment
This project is deployed on **Vercel** — the official platform for Next.js apps.

To deploy your own:
1. Push the repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo
3. Add all 4 environment variables in Vercel dashboard
4. Deploy — done in under 2 minutes

---

## What I Learned
- Building full-stack AI applications with Next.js and TypeScript
- Integrating streaming LLM responses with Groq API
- Document chunking and retrieval strategies for RAG systems
- Working with Supabase for database and vector storage
- Implementing rate limiting with Upstash Redis
- Deploying Next.js apps on Vercel with environment management
- Handling file uploads and text extraction in a serverless environment

---

## License
MIT License — feel free to use and modify.

---

Built by [Ayush Singh Tomar](https://github.com/ayush-s-tomar)
