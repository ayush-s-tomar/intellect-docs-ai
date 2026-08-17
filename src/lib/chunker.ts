import { CHUNKING } from '@/lib/config'

export function chunkText(
  text: string,
  chunkSize: number = CHUNKING.CHUNK_SIZE,
  overlap: number = CHUNKING.OVERLAP,
  minChunkLength: number = CHUNKING.MIN_CHUNK_LENGTH
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
