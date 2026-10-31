// Retrieval-only evaluation on the sample handbook (samples/company-handbook.txt).
// Each question has a fact that must appear verbatim in a retrieved chunk.
// No LLM is involved, so this measures retrieval separately from answering.

export interface RetrievalCase {
  question: string
  fact: string
}

export const HANDBOOK_CASES: RetrievalCase[] = [
  { question: 'How many days of paid leave do employees get?', fact: '25 days of paid leave' },
  { question: 'When was the company founded?', fact: '14 March 2016' },
  { question: 'Who founded Harbor Lane Studio?', fact: 'Maya Okafor' },
  { question: 'How many employees does the studio have?', fact: '42 employees' },
  { question: 'Which client accounts for the most revenue?', fact: 'Brightwave Energy' },
  { question: 'How many days of unused leave carry over?', fact: 'up to 5 days' },
  { question: 'How long is parental leave?', fact: '20 weeks' },
  { question: 'How many days per week can employees work remotely?', fact: 'up to 3 days per week' },
  { question: 'What is the home office allowance?', fact: '800 euros' },
  { question: 'What is the hotel cap per night?', fact: '180 euros per night' },
  { question: 'What is the hotel cap in New York and London?', fact: '220 euros' },
  { question: 'Within how many days must receipts be submitted?', fact: 'within 30 days' },
  { question: 'How much are meals reimbursed per day on client trips?', fact: '55 euros per day' },
  { question: 'What is the minimum password length?', fact: 'at least 14 characters' },
  { question: 'Which password manager is mandatory?', fact: 'Vaultline' },
  { question: 'Who is the security lead?', fact: 'Priya Nair' },
  { question: 'How quickly must a lost device be reported?', fact: 'within 2 hours' },
  { question: 'When do performance reviews happen?', fact: 'in May and November' },
  { question: 'When do salary changes take effect?', fact: '1 July' },
  { question: 'What is the annual learning budget?', fact: '1,200 euros' },
  { question: 'Who is the office manager in Lisbon?', fact: 'Tomas Ferreira' },
  { question: 'What is the security incidents email address?', fact: 'security@harborlane.example' },
]

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function containsFact(chunk: string, fact: string): boolean {
  return normalize(chunk).includes(normalize(fact))
}

export interface RetrievalSummary {
  total: number
  hitAt1: number
  hitAt3: number
  hitAt5: number
  mrr: number
}

// ranks[i] is the 1-based rank of the first chunk containing the fact, or null for a miss.
export function summarizeRetrieval(ranks: (number | null)[]): RetrievalSummary {
  const total = ranks.length
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100))
  const within = (k: number) => ranks.filter(r => r !== null && r <= k).length
  const mrr = total === 0 ? 0 : ranks.reduce<number>((sum, r) => sum + (r === null ? 0 : 1 / r), 0) / total

  return {
    total,
    hitAt1: pct(within(1)),
    hitAt3: pct(within(3)),
    hitAt5: pct(within(5)),
    mrr: Math.round(mrr * 100) / 100,
  }
}

// 1-based rank of the first chunk containing the fact, or null for a miss.
export function rankOfFact(chunks: { content: string }[], fact: string): number | null {
  const idx = chunks.findIndex(c => containsFact(c.content, fact))
  return idx === -1 ? null : idx + 1
}
