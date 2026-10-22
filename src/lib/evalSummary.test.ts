import { describe, it, expect } from 'vitest'
import { summarizeEval, type EvalRowLike } from './evalSummary'

const row = (score: number | null, check: EvalRowLike['check'] = 'N/A'): EvalRowLike => ({
  score,
  check,
  chunksRetrieved: 5,
})

describe('summarizeEval', () => {
  it('averages scored rows and grades the result', () => {
    const s = summarizeEval([row(10), row(8), row(6)], 3)
    expect(s?.averageScore).toBe(8)
    expect(s?.grade).toBe('A')
    expect(s?.passed).toBe(3)
    expect(s?.passRate).toBe(100)
  })

  it('excludes unscored rows from the average instead of counting them as 0', () => {
    const s = summarizeEval([row(10), row(null), row(8)], 3)
    expect(s?.averageScore).toBe(9)
    expect(s?.scored).toBe(2)
    expect(s?.unscored).toBe(1)
  })

  it('counts deterministic checks and ignores N/A', () => {
    const s = summarizeEval([row(9, 'PASS'), row(9, 'FAIL'), row(9, 'N/A')], 3)
    expect(s?.checksTotal).toBe(2)
    expect(s?.checksPassed).toBe(1)
  })

  it('returns null when nothing could be scored', () => {
    expect(summarizeEval([row(null), row(null)], 2)).toBeNull()
    expect(summarizeEval([], 8)).toBeNull()
  })
})