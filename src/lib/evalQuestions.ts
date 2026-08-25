// These are your test questions for evaluating RAG quality.
// Edit these to match whatever test document you use for evals.
//
// Expanded (Day 3) with keyword-heavy / exact-match cases specifically
// to exercise the full-text half of hybrid search — the original set
// was entirely open-ended, which only ever tested vector retrieval and
// wouldn't reveal whether hybrid search is actually pulling its weight.
// Re-run /eval before and after switching chat/route.ts to compare.
//
// NOTE (fix): Q1-Q4 used to carry "expectedKeywords" like ["key","main",
// "important"] — generic vocabulary about the question itself, not actual
// content facts. That meant a fully correct, 10/10-judged answer could
// still fail the keyword check just for not using those specific words
// (e.g. stating a conclusion directly instead of writing "therefore...").
// expectedKeywords is only meaningful for exact-lookup questions (proper
// nouns, numbers, specific terms) — see Q6/Q7 — so open-ended questions
// now correctly use [] and are scored by the judge alone, same as Q5-Q7.

export interface EvalQuestion {
  question: string
  expectedKeywords: string[]  // answer must contain these words to pass
  topic: string               // just a label for the report
  automated?: boolean         // false = manual-only, excluded from /api/eval loop
}

export const evalQuestions: EvalQuestion[] = [
  {
    question: "What is the main topic of this document?",
    expectedKeywords: [],  // open ended — scored by Groq only
    topic: "Document overview"
  },
  {
    question: "Summarize the key points in 2-3 sentences.",
    expectedKeywords: [],  // open ended — scored by Groq only
    topic: "Summarization"
  },
  {
    question: "What are the most important details mentioned?",
    expectedKeywords: [],  // open ended — scored by Groq only
    topic: "Detail extraction"
  },
  {
    question: "What conclusions can be drawn from this document?",
    expectedKeywords: [],  // open ended — scored by Groq only
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
    // being carried into the prompt (see chat/route.ts). Excluded from
    // the automated /api/eval loop since it sends one-shot questions
    // with no prior turn to refer back to. Kept here as a manual test
    // case to run in the chat UI directly after a prior question.
    question: "Can you go into more detail on that last point?",
    expectedKeywords: [],
    topic: "Conversation memory (manual test — ask a question first)",
    automated: false
  }
]

// Questions actually run by /api/eval — excludes manual-only cases
// (automated: false) that require context the one-shot harness can't provide.
export const automatedEvalQuestions: EvalQuestion[] = evalQuestions.filter(
  q => q.automated !== false
)