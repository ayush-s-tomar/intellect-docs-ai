import { env } from '@/lib/env'

type EmbedInputType = 'search_document' | 'search_query'

// Cohere's embed-english-light-v3.0 is token-limited, well above an 800-char
// chunk. 2000 chars covers the chunker's chunkSize plus overlap margin.
const MAX_EMBED_CHARS = 2000

// Cohere allows up to 96 texts per embed call.
const COHERE_BATCH_SIZE = 96

async function embedMany(texts: string[], inputType: EmbedInputType): Promise<number[][]> {
  const cleanTexts = texts.map((t) => t.trim().slice(0, MAX_EMBED_CHARS))

  let response: Response
  try {
    response = await fetch('https://api.cohere.com/v1/embed', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.COHERE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        texts: cleanTexts,
        model: 'embed-english-light-v3.0',
        input_type: inputType,
      }),
      signal: AbortSignal.timeout(20000),
    })
  } catch (e: any) {
    // Network-level failure: DNS, timeout, blocked host.
    throw new Error(`Cohere unreachable: ${e?.cause?.code ?? e?.name ?? e?.message}`)
  }

  if (!response.ok) {
    // Throw instead of returning zero vectors, so bad embeddings are never stored.
    const body = await response.text()
    throw new Error(`Cohere embed failed (${response.status}): ${body.slice(0, 200)}`)
  }

  const data = await response.json()
  return data.embeddings as number[][]
}

// Ingestion time (upload route).
export async function embedText(text: string): Promise<number[]> {
  const [vec] = await embedMany([text], 'search_document')
  return vec
}

// Query time (chat/eval routes). Cohere is asymmetric, so queries must use
// search_query to match chunks embedded as search_document.
export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedMany([text], 'search_query')
  return vec
}

// Batched document embedding: 96 texts per API call instead of one per text.
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = []
  for (let i = 0; i < texts.length; i += COHERE_BATCH_SIZE) {
    const batch = texts.slice(i, i + COHERE_BATCH_SIZE)
    results.push(...(await embedMany(batch, 'search_document')))
  }
  return results
}