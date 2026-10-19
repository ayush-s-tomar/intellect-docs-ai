// Questions used to evaluate RAG quality. Run against one uploaded document
// (the author's test document is a job description).
//
// Scoring has two independent layers:
//   1. An LLM judge scores every answer 0-10 (self-graded: same model family
//      answers and judges, so treat it as a regression signal, not a benchmark).
//   2. Deterministic checks that need no LLM and no document-specific answers:
//        contains_number - the answer must contain at least one digit
//        not_found       - the answer must admit the document doesn't cover it
//      Questions with no check report "n/a" rather than a fake PASS.

export type DeterministicCheck = 'contains_number' | 'not_found'

export interface EvalQuestion {
  question: string
  expectedKeywords: string[]  // optional: answer must contain at least one of these
  check?: DeterministicCheck  // optional deterministic check (see above)
  topic: string               // label for the report
  automated?: boolean         // false = manual-only, excluded from /api/eval loop
}

export const evalQuestions: EvalQuestion[] = [
  {
    question: "What is the main topic of this document?",
    expectedKeywords: [],
    topic: "Document overview"
  },
  {
    question: "Summarize the key points in 2-3 sentences.",
    expectedKeywords: [],
    topic: "Summarization"
  },
  {
    question: "What are the most important details mentioned?",
    expectedKeywords: [],
    topic: "Detail extraction"
  },
  {
    question: "What conclusions can be drawn from this document?",
    expectedKeywords: [],
    topic: "Reasoning"
  },
  {
    question: "Are there any numbers, dates, or statistics mentioned?",
    expectedKeywords: [],
    check: "contains_number",
    topic: "Data extraction"
  },
  {
    // Exact-term lookup: the case pure vector search tends to miss when a
    // proper noun or specific term is not semantically "close" to its chunk.
    question: "Does the document mention any specific names, products, or proper nouns? List them.",
    expectedKeywords: [],
    topic: "Exact keyword match"
  },
  {
    // Numeric lookup: embeddings rank numbers poorly ("42" and "43" embed
    // almost identically), so this exercises the full-text half of hybrid search.
    question: "What specific numbers, percentages, or quantities appear in the document?",
    expectedKeywords: [],
    check: "contains_number",
    topic: "Numeric exact match"
  },
  {
    // Grounding probe: the answer is deliberately absent from any realistic
    // document. A grounded system must say so instead of inventing an answer.
    question: "What does the document say about quantum computing hardware used for lunar mining?",
    expectedKeywords: [],
    check: "not_found",
    topic: "Grounding (should not be found)"
  },
  {
    // Multi-turn follow-up: needs a prior turn, so it is excluded from the
    // one-shot /api/eval loop. Run it manually in the chat UI after a question.
    question: "Can you go into more detail on that last point?",
    expectedKeywords: [],
    topic: "Conversation memory (manual test: ask a question first)",
    automated: false
  }
]

// Questions actually run by /api/eval: excludes manual-only cases.
export const automatedEvalQuestions: EvalQuestion[] = evalQuestions.filter(
  q => q.automated !== false
)