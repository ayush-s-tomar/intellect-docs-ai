// These are your test questions for evaluating RAG quality
// Edit these to match whatever test document you use for evals

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
  }
]