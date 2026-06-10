const GROQ_API_KEY = process.env.GROQ_API_KEY

export async function embedText(text: string): Promise<number[]> {
  const cleanText = text.trim().slice(0, 512)

  const response = await fetch('https://api.groq.com/openai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'nomic-embed-text-v1_5',
      input: cleanText,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    console.error('Groq embedding error:', err)
    return new Array(768).fill(0)
  }

  const data = await response.json()
  return data.data[0].embedding
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = []
  for (const text of texts) {
    const embedding = await embedText(text)
    results.push(embedding)
  }
  return results
}