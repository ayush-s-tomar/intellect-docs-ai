import { describe, it, expect } from 'vitest'
import { containsFact, summarizeRetrieval, rankOfFact, HANDBOOK_CASES } from './retrievalEval'

describe('containsFact', () => {
  it('ignores case and extra whitespace', () => {
    expect(containsFact('Employees receive 25   DAYS of paid\nleave per year', '25 days of paid leave')).toBe(true)
  })

  it('matches numbers with commas literally', () => {
    expect(containsFact('The budget is 1,200 euros per person.', '1,200 euros')).toBe(true)
  })

  it('returns false when the fact is absent', () => {
    expect(containsFact('Core hours are 10:00 to 16:00.', '25 days of paid leave')).toBe(false)
  })
})

describe('summarizeRetrieval', () => {
  it('computes hit rates and MRR', () => {
    const s = summarizeRetrieval([1, 2, null, 1])
    expect(s.total).toBe(4)
    expect(s.hitAt1).toBe(50)
    expect(s.hitAt3).toBe(75)
    expect(s.hitAt5).toBe(75)
    expect(s.mrr).toBe(0.63)
  })

  it('handles an empty list', () => {
    expect(summarizeRetrieval([]).hitAt1).toBe(0)
  })

  it('has a unique, non-empty fact for every case', () => {
    const facts = HANDBOOK_CASES.map(c => c.fact)
    expect(new Set(facts).size).toBe(facts.length)
    expect(facts.every(f => f.length > 0)).toBe(true)
  })
})

describe('rankOfFact', () => {
  const chunks = [{ content: 'Core hours are 10:00 to 16:00.' }, { content: 'Staff get 25 days of paid leave.' }]

  it('returns the 1-based rank of the first matching chunk', () => {
    expect(rankOfFact(chunks, '25 days of paid leave')).toBe(2)
  })

  it('returns null on a miss', () => {
    expect(rankOfFact(chunks, 'Vaultline')).toBeNull()
  })
})
