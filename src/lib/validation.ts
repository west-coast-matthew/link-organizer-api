import { ApiError } from '../errors/api-error'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

export const isHttpUrl = (value: string) => {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Request bodies must be JSON objects. */
export function requireObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('VALIDATION_FAILED', [{ field: 'body', message: 'Send a JSON object.' }])
  }
  return body as Record<string, unknown>
}

/** A path id that is not a UUID can't match a row, so it's a 404 without touching the database. */
export function requireIdParam(id: unknown): string {
  if (!isUuid(id)) throw new ApiError('NOT_FOUND')
  return id.toLowerCase()
}
