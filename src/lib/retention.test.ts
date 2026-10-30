import { describe, it, expect } from 'vitest'
import { expiryCutoff, isExpired } from './retention'

const NOW = new Date('2026-11-15T12:00:00.000Z')

describe('retention', () => {
  it('computes the cutoff N days before now', () => {
    expect(expiryCutoff(NOW, 14).toISOString()).toBe('2026-11-01T12:00:00.000Z')
  })

  it('marks older documents as expired and newer ones as kept', () => {
    expect(isExpired('2026-10-30T00:00:00.000Z', NOW, 14)).toBe(true)
    expect(isExpired('2026-11-10T00:00:00.000Z', NOW, 14)).toBe(false)
  })

  it('treats a document exactly at the cutoff as kept', () => {
    expect(isExpired('2026-11-01T12:00:00.000Z', NOW, 14)).toBe(false)
  })
})