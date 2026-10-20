import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, NOT_FOUND_PHRASE } from './prompts'

describe('buildSystemPrompt', () => {
  it('embeds the context after a CONTEXT marker', () => {
    const prompt = buildSystemPrompt('[Chunk 1]\nHello world')
    expect(prompt).toContain('CONTEXT:\n[Chunk 1]\nHello world')
  })

  it('tells the model the exact not-found phrase the eval checks for', () => {
    expect(buildSystemPrompt('x')).toContain(NOT_FOUND_PHRASE)
    expect(NOT_FOUND_PHRASE.toLowerCase()).toContain('not found in document')
  })

  it('asks for (Chunk N) citations', () => {
    expect(buildSystemPrompt('x')).toContain('(Chunk N)')
  })
})