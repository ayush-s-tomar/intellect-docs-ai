import { env } from '@/lib/env'

type EmbedInputType = 'search_document' | 'search_query'

async function embed(text: string, inputType: EmbedInputType): Promise<number[]> {
  const cleanText = text.trim().slice(0, 512)

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

export async function embedText(text: string): Promise<number[]> {
  return embed(text, 'search_document')
}

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
