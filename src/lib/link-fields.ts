import { LIMITS, type FieldError, type Rating } from '../types'
import { sanitizeNotes } from './notes'
import { isHttpUrl } from './validation'

/** The link fields that can be checked without the database (everything but categoryId). */
export interface LinkFieldValues {
  title?: string
  url?: string
  description?: string | null
  notes?: string | null
  rating?: Rating | null
}

/**
 * Field rules from mock-data/links/{create,update}.json, shared by create, update and
 * data import. On create, title and url are required. Returns only the fields that were
 * sent, cleaned (trimmed, notes sanitized), plus any rule violations.
 */
export function checkLinkFields(input: Record<string, unknown>, isCreate: boolean): { clean: LinkFieldValues; details: FieldError[] } {
  const { titleMaxLength, urlMaxLength, descriptionMaxLength, notesMaxLength, ratingMin, ratingMax } = LIMITS.link
  const details: FieldError[] = []
  const clean: LinkFieldValues = {}

  if (isCreate || input.title !== undefined) {
    const title = typeof input.title === 'string' ? input.title.trim() : ''
    if (!title) details.push({ field: 'title', message: 'Add a title so you can find this link later.' })
    else if (title.length > titleMaxLength) details.push({ field: 'title', message: `Keep the title under ${titleMaxLength} characters.` })
    clean.title = title
  }

  if (isCreate || input.url !== undefined) {
    const url = typeof input.url === 'string' ? input.url.trim() : ''
    if (!isHttpUrl(url)) details.push({ field: 'url', message: 'Enter a web address that starts with http:// or https://.' })
    else if (url.length > urlMaxLength) details.push({ field: 'url', message: 'That web address is too long.' })
    clean.url = url
  }

  if (input.description !== undefined) {
    if (input.description !== null && typeof input.description !== 'string') {
      details.push({ field: 'description', message: 'The description must be text.' })
    } else {
      const description = input.description?.trim() || null
      if (description && description.length > descriptionMaxLength)
        details.push({ field: 'description', message: `Keep the description under ${descriptionMaxLength} characters.` })
      clean.description = description
    }
  }

  if (input.notes !== undefined) {
    if (input.notes !== null && typeof input.notes !== 'string') {
      details.push({ field: 'notes', message: 'The notes must be text.' })
    } else {
      const notes = input.notes === null ? null : sanitizeNotes(input.notes)
      if (notes && notes.length > notesMaxLength) details.push({ field: 'notes', message: `Keep the notes under ${notesMaxLength} characters.` })
      clean.notes = notes
    }
  }

  if (input.rating !== undefined) {
    const rating = input.rating
    if (rating === null) clean.rating = null
    else if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < ratingMin || rating > ratingMax)
      details.push({ field: 'rating', message: `Rating must be a whole number from ${ratingMin} to ${ratingMax}, or null for not rated.` })
    else clean.rating = rating as Rating
  }

  return { clean, details }
}
