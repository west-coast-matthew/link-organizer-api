import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ApiError } from '../errors/api-error'

/** Driver error codes that mean the database can't be reached, as opposed to a bug. */
const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'PROTOCOL_CONNECTION_LOST',
  'ER_CON_COUNT_ERROR',
  'ER_LOCK_WAIT_TIMEOUT',
  'ER_LOCK_DEADLOCK',
])

const driverCode = (error: unknown): string | undefined => {
  const e = error as { code?: unknown; driverError?: { code?: unknown } }
  const code = e?.driverError?.code ?? e?.code
  return typeof code === 'string' ? code : undefined
}

/** Maps anything thrown by a route to the error envelope in mock-data/errors.json. */
function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  const e = error as { type?: string; status?: number }
  // Body-parser failures: malformed JSON, wrong content, too large.
  if (e?.type === 'entity.parse.failed') {
    return new ApiError('VALIDATION_FAILED', [{ field: 'body', message: 'The request body is not valid JSON.' }])
  }
  if (e?.type === 'entity.too.large') {
    return new ApiError('VALIDATION_FAILED', [{ field: 'body', message: 'The request body is too large.' }])
  }

  const code = driverCode(error)
  // A race past the service's duplicate check still hits the unique index.
  if (code === 'ER_DUP_ENTRY') return new ApiError('DUPLICATE_URL')
  if (code && UNAVAILABLE_CODES.has(code)) return new ApiError('SERVICE_UNAVAILABLE')

  return new ApiError('INTERNAL_ERROR')
}

export const notFound: RequestHandler = (_req, _res, next) => next(new ApiError('NOT_FOUND'))

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const apiError = toApiError(error)
  if (apiError.status >= 500) console.error(`[api] ${req.method} ${req.originalUrl} →`, error)
  res.status(apiError.status).json(apiError.body)
}
