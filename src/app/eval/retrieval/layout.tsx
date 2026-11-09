import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Retrieval Check',
  description:
    'LLM-free retrieval evaluation: hit@k and MRR for hybrid search versus vector-only search on known facts.',
}

export default function RetrievalLayout({ children }: { children: React.ReactNode }) {
  return children
}