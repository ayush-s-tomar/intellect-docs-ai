export async function embedText(text: string): Promise<number[]> {
  const response = await fetch(
    'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: text }),
    }
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(`Embedding failed: ${JSON.stringify(data)}`)
  }

  // HuggingFace returns nested array for single input
  return Array.isArray(data[0]) ? data[0] : data
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = []
  for (const text of texts) {
    const embedding = await embedText(text)
    embeddings.push(embedding)
  }
  return embeddings
}