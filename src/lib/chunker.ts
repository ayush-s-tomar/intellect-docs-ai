export function chunkText(
  text: string,
  chunkSize = 800,
  overlap = 150,
  minChunkLength = 40
): string[] {
  const sentences = text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim().length > 0)

  const rawChunks: string[] = []
  let current = ''
  let overlapBuffer = ''

  for (const sentence of sentences) {
    if ((current + sentence).length > chunkSize) {
      if (current.trim()) rawChunks.push(current.trim())
      current = overlapBuffer + sentence + ' '
      overlapBuffer = ''
    } else {
      current += sentence + ' '
      if (current.length > overlap) {
        overlapBuffer = current.slice(-overlap)
      }
    }
  }
  if (current.trim()) rawChunks.push(current.trim())

  // Guard against short trailing fragments (e.g. a lone "See Table 3.")
  // becoming their own chunk. These produce weak, near-random vector
  // embeddings and a near-empty full-text tsvector, so they add noise
  // to both retrieval paths in hybrid search without adding signal.
  // Merge any undersized chunk into the previous one instead of
  // dropping it outright — no content is lost, it just isn't split
  // into a standalone low-quality chunk.
  const chunks: string[] = []
  for (const chunk of rawChunks) {
    if (chunk.length < minChunkLength && chunks.length > 0) {
      chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${chunk}`.trim()
    } else {
      chunks.push(chunk)
    }
  }

  return chunks
}