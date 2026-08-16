import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

export type ApiSuccess<T> = {
  success: true
  data: T
}

export type ApiError = {
  success: false
  error: string
  code: ApiErrorCode
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL_ERROR'

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  UPSTREAM_ERROR: 502,
  INTERNAL_ERROR: 500,
}

export function apiSuccess<T>(data: T, status = 200) {
  const body: ApiSuccess<T> = { success: true, data }
  return NextResponse.json(body, { status })
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  extraHeaders?: Record<string, string>
) {
  const body: ApiError = { success: false, error: message, code }
  return NextResponse.json(body, {
    status: STATUS_BY_CODE[code],
    headers: extraHeaders,
  })
}

export class ApiHandledError extends Error {
  constructor(public code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'ApiHandledError'
  }
}

export function handleApiError(err: unknown, routeName: string) {
  if (err instanceof ApiHandledError) {
    logger.warn(routeName, err.message, { code: err.code })
    return apiError(err.code, err.message)
  }

  const message = err instanceof Error ? err.message : 'Unknown error'
  const stack = err instanceof Error ? err.stack : undefined
  logger.error(routeName, `Unhandled error: ${message}`, { stack })
  return apiError('INTERNAL_ERROR', `Something went wrong: ${message}`)
}
