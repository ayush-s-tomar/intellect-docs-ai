const HF_API_KEY = process.env.HUGGINGFACE_API_KEY
const MODEL = 'sentence-transformers/all-MiniLM-L6-v2'

export async function embedText(text: string): Promise<number[]> {
  // 👇 DEBUG: print to terminal so we can see what's happening
  console.log('HF_API_KEY exists:', !!HF_API_KEY)
  console.log('HF_API_KEY starts with:', HF_API_KEY?.slice(0, 5))

  const cleanText = text.trim().slice(0, 512)

  try {
    const response = await fetch(
  `https://api-inference.huggingface.co/models/${MODEL}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: cleanText,
          options: { wait_for_model: true }
        }),
      }
    )

    console.log('HF response status:', response.status)

    if (!response.ok) {
      const err = await response.text()
      console.error('HF error body:', err)
      // Fallback to zeros — upload won't crash
      return new Array(384).fill(0)
    }

    const data = await response.json()
    console.log('HF response type:', typeof data, Array.isArray(data))

    if (Array.isArray(data[0])) return data[0]
    return data

  } catch (err: any) {
    console.error('HF fetch threw an error:', err.message)
    // Fallback to zeros
    return new Array(384).fill(0)
  }
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = []
  for (const text of texts) {
    const embedding = await embedText(text)
    results.push(embedding)
  }
  return results
}