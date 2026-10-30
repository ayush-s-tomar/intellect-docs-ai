// Documents created before this instant are expired.
export function expiryCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

export function isExpired(createdAt: string | Date, now: Date, days: number): boolean {
  return new Date(createdAt).getTime() < expiryCutoff(now, days).getTime()
}