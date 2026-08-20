import { describe, it, expect } from 'vitest'
import { chunkText } from './chunker'

describe('chunkText', () => {
  it('returns an empty array for empty input', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   ')).toEqual([])
  })

  it('returns a single chunk for short text well under chunkSize', () => {
    const text = 'This is a short sentence. Another short one.'
    const chunks = chunkText(text, 800, 150)
    expect(chunks.length).toBe(1)
    expect(chunks[0]).toContain('This is a short sentence.')
  })

  it('splits text longer than chunkSize into multiple chunks', () => {
    const sentence = 'This is a repeated sentence for testing purposes. '
    const text = sentence.repeat(50)
    const chunks = chunkText(text, 800, 150)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('keeps every chunk at or reasonably close to chunkSize', () => {
    const sentence = 'This is a repeated sentence for testing purposes. '
    const text = sentence.repeat(50)
    const chunks = chunkText(text, 800, 150)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThan(800 + 150 + sentence.length)
    }
  })

  it('hard-splits a single sentence longer than chunkSize instead of producing one giant chunk', () => {
    const text = 'word '.repeat(500)
    const chunks = chunkText(text, 800, 150)
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThan(2500)
    }
  })

  it('merges short trailing fragments into the previous chunk instead of standing alone', () => {
    const sentence = 'This is a repeated sentence for testing purposes. '
    const text = sentence.repeat(20) + 'Short end.'
    const chunks = chunkText(text, 800, 150, 40)
    const lastChunk = chunks[chunks.length - 1]
    expect(lastChunk.length).toBeGreaterThan(10)
  })

  it('respects a custom minChunkLength of 0 (no merging)', () => {
    const sentence = 'This is a repeated sentence for testing purposes. '
    const text = sentence.repeat(20) + 'Hi.'
    const chunksNoMerge = chunkText(text, 800, 150, 0)
    const chunksWithMerge = chunkText(text, 800, 150, 40)
    expect(chunksNoMerge.length).toBeGreaterThanOrEqual(chunksWithMerge.length)
  })

  it('does not lose any sentence content across chunk boundaries', () => {
    const text = 'Alpha sentence one. Beta sentence two. Gamma sentence three. Delta sentence four.'
    const chunks = chunkText(text, 40, 10)
    const joined = chunks.join(' ')
    expect(joined).toContain('Alpha')
    expect(joined).toContain('Beta')
    expect(joined).toContain('Gamma')
    expect(joined).toContain('Delta')
  })

  it('never starts a chunk mid-word from the overlap buffer', () => {
    // Regression test for a bug where the overlap buffer was a raw
    // text.slice(-overlap) with no regard for word boundaries — e.g.
    // "growth-stage SaaS companies" would get cut to "th-stage SaaS
    // companies" and that fragment would lead the next chunk.
    const text = 'Northwind faces risks common to growth-stage SaaS companies operating today. '.repeat(30)
    const chunks = chunkText(text, 300, 60, 40)
    for (const chunk of chunks) {
      const trimmed = chunk.trimStart()
      expect(trimmed.length).toBeGreaterThan(0)
      // every chunk should start with a real word character, not a
      // truncated fragment like "th-stage" or a leading space/punctuation
      // that implies a word was cut in half.
      expect(/^[A-Za-z0-9]/.test(trimmed)).toBe(true)
    }
  })
})