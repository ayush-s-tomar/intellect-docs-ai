import { pipeline } from '@xenova/transformers'

let embedder: any = null

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    )
  }
  return embedder
}

export async function embedText(text: string): Promise<number[]> {
  const embed = await getEmbedder()
  const output = await embed(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data) as number[]
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const embed = await getEmbedder()
  const results: number[][] = []
  for (const text of texts) {
    const output = await embed(text, { pooling: 'mean', normalize: true })
    results.push(Array.from(output.data) as number[])
  }
  return results
}