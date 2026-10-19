import { CHUNKING } from '@/lib/config'

// Cuts the last `overlap` chars off `text`, then trims forward to the next
// whitespace so we never start a chunk inside a word (e.g. "growth-stage" ->
// "th-stage"). Looks for any whitespace (space, newline, tab) because text
// extracted from PDFs often breaks lines with "\n" instead of spaces.
function sliceOverlapAtWordBoundary(text: string, overlap: number): string {
  const raw = text.slice(-overlap)
  const firstWhitespace = raw.search(/\s/)
  // No whitespace at all (one very long "word"), or it is the very first
  // character: there is no clean boundary to snap to, so use the raw slice.
  if (firstWhitespace <= 0) return raw
  return raw.slice(firstWhitespace + 1)
}

// A "sentence" longer than maxLen (common in PDF text with no punctuation)
// is split at the last whitespace inside the window, or hard-cut if there is
// no usable boundary. Nothing is truncated, so every character gets embedded.
function splitOversized(sentence: string, maxLen: number): string[] {
  let rest = sentence.trim()
  if (rest.length <= maxLen) return rest ? [rest] : []

  const pieces: string[] = []
  while (rest.length > maxLen) {
    const window = rest.slice(0, maxLen)
    let cut = Math.max(window.lastIndexOf(' '), window.lastIndexOf('\n'), window.lastIndexOf('\t'))
    if (cut < maxLen / 2) cut = maxLen
    pieces.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) pieces.push(rest)
  return pieces
}

export function chunkText(
  text: string,
  chunkSize: number = CHUNKING.CHUNK_SIZE,
  overlap: number = CHUNKING.OVERLAP,
  minChunkLength: number = CHUNKING.MIN_CHUNK_LENGTH
): string[] {
  // Leave room for the overlap prefix so a split piece plus overlap still
  // fits inside chunkSize.
  const maxPiece = Math.max(chunkSize - overlap, Math.floor(chunkSize / 2))

  const sentences = text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim().length > 0)
    .flatMap(s => splitOversized(s, maxPiece))

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