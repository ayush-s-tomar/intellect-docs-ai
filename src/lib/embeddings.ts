const COHERE_API_KEY = process.env.COHERE_API_KEY

type EmbedInputType = 'search_document' | 'search_query'

async function embed(text: string, inputType: EmbedInputType): Promise<number[]> {
  const cleanText = text.trim().slice(0, 512)

  const response = await fetch('https://api.cohere.com/v1/embed', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${COHERE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      texts: [cleanText],
      model: 'embed-english-light-v3.0',  // free, 384 dimensions
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

// Use for chunks going INTO storage at upload time.
// Cohere's embed-v3 models are trained asymmetrically — document and
// query text occupy different regions of the same vector space, so
// tagging input_type correctly measurably improves retrieval quality
// versus using 'search_document' for everything.
export async function embedText(text: string): Promise<number[]> {
  return embed(text, 'search_document')
}

// Use for the user's question at query time (chat + eval).
// This was previously calling embedText() (i.e. 'search_document')
// for queries too — an asymmetric-embedding mismatch that silently
// hurt cosine-similarity ranking on every request.
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