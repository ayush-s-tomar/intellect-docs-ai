// Dummy embedding - returns zeros (we'll use text search instead)
export async function embedText(text: string): Promise<number[]> {
  return new Array(384).fill(0)
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  return texts.map(() => new Array(384).fill(0))
}