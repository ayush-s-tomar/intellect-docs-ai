export type CheckResult = 'PASS' | 'FAIL' | 'N/A'

export interface EvalRowLike {
  score: number | null
  check: CheckResult
  chunksRetrieved: number
}

export interface EvalSummary {
  totalQuestions: number
  scored: number
  unscored: number
  averageScore: number
  passed: number
  failed: number
  passRate: number
  checksTotal: number
  checksPassed: number
  avgChunksRetrieved: number
  grade: string
}

// Unscored rows (judge call failed) are excluded from the average, never counted as 0.
export function summarizeEval(results: EvalRowLike[], totalQuestions: number): EvalSummary | null {
  const scored = results.filter(r => r.score !== null) as (EvalRowLike & { score: number })[]
  if (scored.length === 0) return null

  const avgScore = Math.round((scored.reduce((sum, r) => sum + r.score, 0) / scored.length) * 10) / 10
  const passCount = scored.filter(r => r.score >= 6).length
  const checked = results.filter(r => r.check !== 'N/A')
  const avgChunks = Math.round((results.reduce((sum, r) => sum + r.chunksRetrieved, 0) / results.length) * 10) / 10

  return {
    totalQuestions,
    scored: scored.length,
    unscored: results.length - scored.length,
    averageScore: avgScore,
    passed: passCount,
    failed: scored.length - passCount,
    passRate: Math.round((passCount / scored.length) * 100),
    checksTotal: checked.length,
    checksPassed: checked.filter(r => r.check === 'PASS').length,
    avgChunksRetrieved: avgChunks,
    grade: avgScore >= 8 ? 'A' : avgScore >= 6 ? 'B' : avgScore >= 4 ? 'C' : 'D',
  }
}