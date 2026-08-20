import { env } from '@/lib/env'

type EmbedInputType = 'search_document' | 'search_query'

// Cohere's embed-english-light-v3.0 accepts far more than 512 chars per
// text (limit is token-based, well above what an 800-char chunk needs).
// The old 512 cutoff was silently truncating chunks before embedding —
// so `content` stored the full ~800 chars but the embedding only ever
// represented the first 512, meaning anything mentioned in the back
// half of a chunk was invisible to vector search. Raised to comfortably
// cover the chunker's chunkSize (800) plus its overlap margin.
const MAX_EMBED_CHARS = 2000

async function embed(text: string, inputType: EmbedInputType): Promise<number[]> {
  const cleanText = text.trim().slice(0, MAX_EMBED_CHARS)

  const response = await fetch('https://api.cohere.com/v1/embed', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.COHERE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      texts: [cleanText],
      model: 'embed-english-light-v3.0',
      input_type: inputType,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    console.error('Cohere embedding error:', err)
    return new Array(384).fill(0)
  }

  const data = await response.json()
  return data.embeddings[0]
}

// Use for embedding chunks/documents at ingestion time (upload route).
export async function embedText(text: string): Promise<number[]> {
  return embed(text, 'search_document')
}

// Use for embedding the user's question at query time (chat/eval routes).
// Cohere's model is asymmetric — search_query and search_document produce
// embeddings tuned to be close to each other for matching pairs, but a
// query embedded as search_document will NOT reliably match a chunk
// embedded as search_document, even on-topic. Always use this for queries.
export async function embedQuery(text: string): Promise<number[]> {
  return embed(text, 'search_query')
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = []
  for (const text of texts) {
    const embedding = await embedText(text)
    results.push(embedding)
  }
  return results
}