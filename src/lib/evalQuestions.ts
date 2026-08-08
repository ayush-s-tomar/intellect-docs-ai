// These are your test questions for evaluating RAG quality.
// Edit these to match whatever test document you use for evals.
//
// Expanded (Day 3) with keyword-heavy / exact-match cases specifically
// to exercise the full-text half of hybrid search — the original set
// was entirely open-ended, which only ever tested vector retrieval and
// wouldn't reveal whether hybrid search is actually pulling its weight.
// Re-run /eval before and after switching chat/route.ts to compare.

export interface EvalQuestion {
  question: string
  expectedKeywords: string[]  // answer must contain these words to pass
  topic: string               // just a label for the report
}

export const evalQuestions: EvalQuestion[] = [
  {
    question: "What is the main topic of this document?",
    expectedKeywords: ["document", "about", "contains"],
    topic: "Document overview"
  },
  {
    question: "Summarize the key points in 2-3 sentences.",
    expectedKeywords: ["key", "main", "important"],
    topic: "Summarization"
  },
  {
    question: "What are the most important details mentioned?",
    expectedKeywords: ["details", "mentioned", "important"],
    topic: "Detail extraction"
  },
  {
    question: "What conclusions can be drawn from this document?",
    expectedKeywords: ["conclusion", "therefore", "shows", "indicates"],
    topic: "Reasoning"
  },
  {
    question: "Are there any numbers, dates, or statistics mentioned?",
    expectedKeywords: [],  // open ended — scored by Groq only
    topic: "Data extraction"
  },
  {
    // Exact-term lookup — the case pure vector search tends to miss
    // when a proper noun or specific term isn't semantically "close"
    // to anything else in the chunk. Full-text search should catch
    // this directly via websearch_to_tsquery.
    question: "Does the document mention any specific names, products, or proper nouns? List them.",
    expectedKeywords: [],
    topic: "Exact keyword match"
  },
  {
    // Numeric/exact-value lookup — cosine similarity on embeddings
    // often ranks numbers poorly since "42" and "43" embed almost
    // identically despite being factually distinct.
    question: "What specific numbers, percentages, or quantities appear in the document?",
    expectedKeywords: [],
    topic: "Numeric exact match"
  },
  {
    // Multi-turn follow-up — depends on MAX_HISTORY_MESSAGES context
    // being carried into the prompt (see chat/route.ts). Not run by
    // the eval harness in isolation since /api/eval sends one-shot
    // questions, but kept here as a manual test case to run in the
    // chat UI directly after a prior question.
    question: "Can you go into more detail on that last point?",
    expectedKeywords: [],
    topic: "Conversation memory (manual test — ask a question first)"
  }
]