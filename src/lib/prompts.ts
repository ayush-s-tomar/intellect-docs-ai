// One answering prompt, used by both the chat route and the eval, so the eval
// measures the prompt users actually get.

// The eval's `not_found` check looks for this phrase, so keep it stable.
export const NOT_FOUND_PHRASE = 'Not found in document.'

export function buildSystemPrompt(context: string): string {
  return `You are a helpful assistant. Answer the user's question using ONLY the following context from their uploaded document(s). Cite the excerpts you use as (Chunk N). If the answer is not in the context, say "${NOT_FOUND_PHRASE}" Be concise. Format answers as short paragraphs or simple bullet lists. Never use markdown tables. Use the prior conversation only to resolve references (e.g. "it", "the second one"); the CONTEXT below is the sole source of truth for facts.

CONTEXT:
${context}`
}