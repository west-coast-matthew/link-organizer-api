import type { ErrorBody, ErrorCode, FieldError } from '../types'

/** Status and user-facing message per code (mock-data/errors.json). */
export const ERRORS: Record<ErrorCode, { status: number; message: string }> = {
  VALIDATION_FAILED: { status: 400, message: 'Some fields need attention.' },
  NOT_FOUND: { status: 404, message: 'That item no longer exists. It may have been deleted.' },
  DUPLICATE_URL: { status: 409, message: 'This link is already saved.' },
  DUPLICATE_CATEGORY: { status: 409, message: 'A category with this name already exists here.' },
  INTERNAL_ERROR: { status: 500, message: 'Something went wrong on the server. Try again.' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'The server is unavailable right now. Try again in a moment.' },
}

/** Thrown for every non-2xx response. `body` is exactly what the API sends. */
export class ApiError extends Error {
  readonly status: number
  readonly code: ErrorCode
  readonly details?: FieldError[]

  constructor(code: ErrorCode, details?: FieldError[], message = ERRORS[code].message) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = ERRORS[code].status
    this.details = details
  }

  get body(): ErrorBody {
    return { error: { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) } }
  }
}
