import { describe, it, expect } from 'vitest'
import { chatRequestSchema, evalRequestSchema, formatZodError } from './validation'

describe('chatRequestSchema', () => {
  it('accepts a valid chat request', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'Hello' }],
      selectedDocIds: ['1', '2'],
      session_id: 'abc-123',
    })
    expect(result.success).toBe(true)
  })

  it('defaults selectedDocIds to an empty array when omitted', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'Hello' }],
      session_id: 'abc-123',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.selectedDocIds).toEqual([])
    }
  })

  it('rejects an empty messages array', () => {
    const result = chatRequestSchema.safeParse({
      messages: [],
      session_id: 'abc-123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a missing session_id', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'Hello' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects a message with empty content', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: '' }],
      session_id: 'abc-123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid role', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'system', content: 'Hello' }],
      session_id: 'abc-123',
    })
    expect(result.success).toBe(false)
  })
})

describe('evalRequestSchema', () => {
  it('accepts a valid request with a string document_id', () => {
    const result = evalRequestSchema.safeParse({
      session_id: 'abc-123',
      document_id: '42',
    })
    expect(result.success).toBe(true)
  })

  it('accepts and coerces a numeric document_id to a string', () => {
    const result = evalRequestSchema.safeParse({
      session_id: 'abc-123',
      document_id: 42,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.document_id).toBe('42')
    }
  })

  it('rejects a missing session_id', () => {
    const result = evalRequestSchema.safeParse({
      document_id: '42',
    })
    expect(result.success).toBe(false)
  })
})

describe('formatZodError', () => {
  it('produces a readable single-line message from validation issues', () => {
    const result = chatRequestSchema.safeParse({ messages: [] })
    expect(result.success).toBe(false)
    if (!result.success) {
      const message = formatZodError(result.error)
      expect(typeof message).toBe('string')
      expect(message.length).toBeGreaterThan(0)
    }
  })
})
