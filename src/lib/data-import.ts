/**
 * Data import planning (spec 004). Pure: given an export document and what the database
 * already holds, works out which categories and links to create and which to skip. The
 * service does the reads and writes.
 *
 * Import merges and never overwrites:
 *   - a category whose id already exists is used as is ("existing");
 *   - otherwise one with the same name under the same parent is reused ("merged");
 *   - otherwise it's created with the file's id, name and timestamps;
 *   - a missing or cyclic parent makes it top-level;
 *   - a link whose URL is already saved (or repeated in the file) is skipped;
 *   - a link's category follows that mapping, and is unsorted if unknown.
 */
import { randomUUID } from 'node:crypto'
import { ApiError } from '../errors/api-error'
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  LIMITS,
  type FieldError,
  type ImportSkippedCategory,
  type ImportSkippedLink,
  type Rating,
} from '../types'
import { checkLinkFields } from './link-fields'
import { isUuid } from './validation'

/** Case-insensitive, accent-sensitive — the same comparison category-service uses. */
const sameText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** A valid ISO 8601 timestamp as a Date, otherwise `fallback`. */
function toDate(value: unknown, fallback: Date): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date
}

/* ---------- Whole-file checks ---------- */

export interface CheckedDocument {
  categories: unknown[]
  links: unknown[]
}

/** Rejects anything that isn't a supported export file, before anything is written. */
export function checkDocument(body: unknown): CheckedDocument {
  if (!isObject(body) || body.format !== EXPORT_FORMAT) {
    throw new ApiError('VALIDATION_FAILED', [{ field: 'format', message: "This isn't a Link Organizer export file." }])
  }
  if (body.version !== EXPORT_VERSION) {
    const newer = typeof body.version === 'number' && body.version > EXPORT_VERSION
    throw new ApiError('VALIDATION_FAILED', [
      {
        field: 'version',
        message: newer
          ? 'This file was made by a newer version of Link Organizer.'
          : `This file's version isn't supported. Expected version ${EXPORT_VERSION}.`,
      },
    ])
  }

  const { maxCategories, maxLinks } = LIMITS.dataImport
  const details: FieldError[] = []
  if (!Array.isArray(body.categories)) details.push({ field: 'categories', message: 'The file has no list of categories.' })
  else if (body.categories.length > maxCategories)
    details.push({ field: 'categories', message: `Import at most ${maxCategories.toLocaleString('en-US')} categories at a time.` })
  if (!Array.isArray(body.links)) details.push({ field: 'links', message: 'The file has no list of links.' })
  else if (body.links.length > maxLinks)
    details.push({ field: 'links', message: `Import at most ${maxLinks.toLocaleString('en-US')} links at a time.` })
  if (details.length) throw new ApiError('VALIDATION_FAILED', details)

  return { categories: body.categories as unknown[], links: body.links as unknown[] }
}

/* ---------- Categories ---------- */

export interface ExistingCategory {
  id: string
  name: string
  parentId: string | null
}

export interface NewCategory {
  id: string
  name: string
  parentId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CategoryPlan {
  /** In insert order: every parent comes before its children. */
  create: NewCategory[]
  existing: number
  merged: number
  skipped: ImportSkippedCategory[]
  /** The database id a category id from the file (or the database) stands for, or null if unknown. */
  resolve: (fileId: unknown) => string | null
}

interface CategoryEntry {
  index: number
  id: string
  name: string
  parentId: string | null
  createdAt: Date
  updatedAt: Date
}

export function planCategories(entries: unknown[], existing: ExistingCategory[], now = new Date()): CategoryPlan {
  const maxName = LIMITS.category.nameMaxLength
  const skipped: ImportSkippedCategory[] = []
  const valid: CategoryEntry[] = []
  const seen = new Set<string>()

  entries.forEach((raw, i) => {
    const index = i + 1
    const name = isObject(raw) && typeof raw.name === 'string' ? raw.name.trim() : ''
    const skip = (message: string) => skipped.push({ index, name, code: 'VALIDATION_FAILED', message })

    if (!isObject(raw)) return skip("This entry isn't a category.")
    if (!isUuid(raw.id)) return skip('The category has no valid id.')
    const id = raw.id.toLowerCase()
    if (seen.has(id)) return skip('Repeats an earlier category in the file.')
    if (!name) return skip('The category has no name.')
    if (name.length > maxName) return skip(`Keep the name under ${maxName} characters.`)
    seen.add(id)

    const createdAt = toDate(raw.createdAt, now)
    valid.push({
      index,
      id,
      name,
      parentId: isUuid(raw.parentId) ? raw.parentId.toLowerCase() : null,
      createdAt,
      updatedAt: toDate(raw.updatedAt, createdAt),
    })
  })

  // Every category known so far, in the database or about to be created.
  const known: ExistingCategory[] = [...existing]
  const dbIds = new Set(existing.map((c) => c.id))
  const fileIds = new Set(valid.map((c) => c.id))
  const mapping = new Map<string, string>()
  const create: NewCategory[] = []
  let existingCount = 0
  let merged = 0

  const place = (entry: CategoryEntry, parentId: string | null) => {
    if (dbIds.has(entry.id)) {
      existingCount++
      mapping.set(entry.id, entry.id)
      return
    }
    const twin = known.find((c) => c.parentId === parentId && sameText(c.name, entry.name))
    if (twin) {
      merged++
      mapping.set(entry.id, twin.id)
      return
    }
    const category: NewCategory = { id: entry.id, name: entry.name, parentId, createdAt: entry.createdAt, updatedAt: entry.updatedAt }
    create.push(category)
    known.push(category)
    mapping.set(entry.id, entry.id)
  }

  // Parents first. A parent outside the file resolves against the database (or top-level).
  let pending = valid
  for (let progressed = true; pending.length && progressed; ) {
    progressed = false
    const waiting: CategoryEntry[] = []
    for (const entry of pending) {
      const parent = entry.parentId
      if (parent === null || !fileIds.has(parent)) {
        place(entry, parent !== null && dbIds.has(parent) ? parent : null)
        progressed = true
      } else if (mapping.has(parent)) {
        place(entry, mapping.get(parent)!)
        progressed = true
      } else waiting.push(entry)
    }
    pending = waiting
  }
  // Whatever is left is part of a cycle: break it by making those categories top-level.
  for (const entry of pending) place(entry, null)

  const resolve = (fileId: unknown): string | null => {
    if (!isUuid(fileId)) return null
    const id = fileId.toLowerCase()
    return mapping.get(id) ?? (dbIds.has(id) ? id : null)
  }

  return { create, existing: existingCount, merged, skipped, resolve }
}

/* ---------- Links ---------- */

export interface NewLink {
  id: string
  title: string
  url: string
  description: string | null
  notes: string | null
  categoryId: string | null
  rating: Rating | null
  createdAt: Date
  updatedAt: Date
}

/** A link to create, with its 1-based position in the file for error reports. */
export interface PlannedLink {
  index: number
  link: NewLink
}

export interface LinkPlan {
  create: PlannedLink[]
  skipped: ImportSkippedLink[]
}

export function planLinks(
  entries: unknown[],
  existing: { ids: ReadonlySet<string>; urls: ReadonlyMap<string, string> },
  resolveCategory: (fileId: unknown) => string | null,
  now = new Date(),
): LinkPlan {
  const create: PlannedLink[] = []
  const skipped: ImportSkippedLink[] = []
  const usedIds = new Set(existing.ids)
  // URL → title of the link that has it, for "Already saved as …".
  const urls = new Map(existing.urls)

  entries.forEach((raw, i) => {
    const index = i + 1
    const title = isObject(raw) && typeof raw.title === 'string' ? raw.title.trim() : ''
    const rawUrl = isObject(raw) && typeof raw.url === 'string' ? raw.url.trim() : ''

    if (!isObject(raw)) {
      skipped.push({ index, title, url: rawUrl, code: 'VALIDATION_FAILED', message: "This entry isn't a link." })
      return
    }
    const fields = { title: raw.title, url: raw.url, description: raw.description ?? null, notes: raw.notes ?? null, rating: raw.rating ?? null }
    const { clean, details } = checkLinkFields(fields, true)
    if (details.length) {
      skipped.push({ index, title, url: rawUrl, code: 'VALIDATION_FAILED', message: details.map((d) => d.message).join(' ') })
      return
    }
    const url = clean.url!
    const savedAs = urls.get(url)
    if (savedAs !== undefined) {
      skipped.push({ index, title, url, code: 'DUPLICATE_URL', message: `Already saved as "${savedAs}".` })
      return
    }

    const fileId = isUuid(raw.id) ? raw.id.toLowerCase() : null
    const id = fileId && !usedIds.has(fileId) ? fileId : randomUUID()
    usedIds.add(id)
    urls.set(url, clean.title!)

    const createdAt = toDate(raw.createdAt, now)
    create.push({
      index,
      link: {
        id,
        title: clean.title!,
        url,
        description: clean.description ?? null,
        notes: clean.notes ?? null,
        categoryId: resolveCategory(raw.categoryId),
        rating: clean.rating ?? null,
        createdAt,
        updatedAt: toDate(raw.updatedAt, createdAt),
      },
    })
  })

  return { create, skipped }
}
