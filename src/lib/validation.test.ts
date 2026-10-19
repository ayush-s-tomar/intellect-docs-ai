import { describe, it, expect } from 'vitest'
import {
  chatRequestSchema,
  evalRequestSchema,
  documentsDeleteSchema,
  documentsQuerySchema,
  uploadFieldsSchema,
  formatZodError,
} from './validation'

const SESSION = '3f2b8c1e-5a4d-4e9b-8c7a-1d2e3f4a5b6c'

describe('chatRequestSchema', () => {
  it('accepts a valid chat request', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'Hello' }],
      selectedDocIds: ['1', '2'],
      session_id: SESSION,
    })
    expect(result.success).toBe(true)
  })

  it('defaults selectedDocIds to an empty array when omitted', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'Hello' }],
      session_id: SESSION,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.selectedDocIds).toEqual([])
    }
  })

  it('coerces numeric document ids to strings', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'Hello' }],
      selectedDocIds: [1, '2'],
      session_id: SESSION,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.selectedDocIds).toEqual(['1', '2'])
    }
  })

  it('rejects an empty messages array', () => {
    const result = chatRequestSchema.safeParse({ messages: [], session_id: SESSION })
    expect(result.success).toBe(false)
  })

  it('rejects a missing session_id', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'Hello' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects a session_id that is not a UUID', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'Hello' }],
      session_id: 'abc-123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a message with empty content', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: '' }],
      session_id: SESSION,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a message that is too long', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'x'.repeat(20001) }],
      session_id: SESSION,
    })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid role', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'system', content: 'Hello' }],
      session_id: SESSION,
    })
    expect(result.success).toBe(false)
  })

  it('rejects more than 50 selected documents', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'Hello' }],
      selectedDocIds: Array.from({ length: 51 }, (_, i) => String(i)),
      session_id: SESSION,
    })
    expect(result.success).toBe(false)
  })
})

describe('evalRequestSchema', () => {
  it('accepts a valid request with a string document_id', () => {
    const result = evalRequestSchema.safeParse({ session_id: SESSION, document_id: '42' })
    expect(result.success).toBe(true)
  })

  it('accepts and coerces a numeric document_id to a string', () => {
    const result = evalRequestSchema.safeParse({ session_id: SESSION, document_id: 42 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.document_id).toBe('42')
    }
  })

  it('rejects a missing session_id', () => {
    const result = evalRequestSchema.safeParse({ document_id: '42' })
    expect(result.success).toBe(false)
  })
})

describe('session and document id schemas', () => {
  it('documentsQuerySchema and uploadFieldsSchema require a UUID session_id', () => {
    expect(documentsQuerySchema.safeParse({ session_id: SESSION }).success).toBe(true)
    expect(documentsQuerySchema.safeParse({ session_id: 'not-a-uuid' }).success).toBe(false)
    expect(uploadFieldsSchema.safeParse({ session_id: SESSION }).success).toBe(true)
    expect(uploadFieldsSchema.safeParse({ session_id: '' }).success).toBe(false)
  })

  it('documentsDeleteSchema accepts digit-only ids and rejects anything else', () => {
    expect(documentsDeleteSchema.safeParse({ id: '42' }).success).toBe(true)
    expect(documentsDeleteSchema.safeParse({ id: 'abc' }).success).toBe(false)
    expect(documentsDeleteSchema.safeParse({ id: '4; DROP TABLE documents' }).success).toBe(false)
    expect(documentsDeleteSchema.safeParse({ id: '' }).success).toBe(false)
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