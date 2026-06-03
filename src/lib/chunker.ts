export function chunkText(
  text: string,
  chunkSize = 800,
  overlap = 150
): string[] {
  const sentences = text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim().length > 0)

  const chunks: string[] = []
  let current = ''
  let overlapBuffer = ''

  for (const sentence of sentences) {
    if ((current + sentence).length > chunkSize) {
      if (current.trim()) chunks.push(current.trim())
      current = overlapBuffer + sentence + ' '
      overlapBuffer = ''
    } else {
      current += sentence + ' '
      if (current.length > overlap) {
        overlapBuffer = current.slice(-overlap)
      }
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}