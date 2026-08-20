import { CHUNKING } from '@/lib/config'

// Cuts the last `overlap` chars off `text`, then trims forward to the next
// word boundary so we never split inside a word (e.g. "growth-stage" ->
// "th-stage"). A plain text.slice(-overlap) has no notion of word
// boundaries and will cut wherever the character count happens to land.
function sliceOverlapAtWordBoundary(text: string, overlap: number): string {
  const raw = text.slice(-overlap)
  const firstSpace = raw.indexOf(' ')
  // If there's no space in the slice (single very long "word"), or the
  // space is right at the start, just use the raw slice as-is — there's
  // no clean boundary to snap to anyway.
  if (firstSpace <= 0) return raw
  return raw.slice(firstSpace + 1)
}

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
        overlapBuffer = sliceOverlapAtWordBoundary(current, overlap)
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