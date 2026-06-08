const HF_API_KEY = process.env.HUGGINGFACE_API_KEY
const MODEL = 'sentence-transformers/all-MiniLM-L6-v2'

export async function embedText(text: string): Promise<number[]> {
  // Clean the text — remove extra whitespace
  const cleanText = text.trim().slice(0, 512)

  const response = await fetch(
    `https://api-inference.huggingface.co/pipeline/feature-extraction/${MODEL}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: cleanText,
        options: { wait_for_model: true }  // waits if model is cold-starting
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    console.error('HuggingFace error:', err)
    // Fallback to zeros so upload doesn't crash
    return new Array(384).fill(0)
  }

  const data = await response.json()

  // HuggingFace returns [[...vector...]] for single input
  // We need the inner array
  if (Array.isArray(data[0])) return data[0]
  return data
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  // Process one at a time to avoid rate limits
  const results: number[][] = []
  for (const text of texts) {
    const embedding = await embedText(text)
    results.push(embedding)
  }
  return results
}