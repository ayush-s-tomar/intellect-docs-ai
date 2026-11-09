import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'RAG Eval Suite',
  description:
    'Regression check for a RAG pipeline: an LLM judge plus deterministic checks, run one question at a time with live progress.',
}

export default function EvalLayout({ children }: { children: React.ReactNode }) {
  return children
}