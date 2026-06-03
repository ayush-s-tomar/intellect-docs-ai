export async function embedText(text: string): Promise<number[]> {
  const response = await fetch('https://api.groq.com/openai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'nomic-embed-text-v1_5',
      input: text,
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(`Embedding failed: ${data.error?.message || 'Unknown error'}`)
  }

  return data.data[0].embedding
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = []
  for (const text of texts) {
    const embedding = await embedText(text)
    embeddings.push(embedding)
  }
  return embeddings
}