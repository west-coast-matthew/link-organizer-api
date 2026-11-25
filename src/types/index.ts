/*
 * API contract types. These mirror ../link-organizer-ui/src/types.ts and
 * ../link-organizer-ui/mock-data/models.json — the contract lives in the UI's
 * mock-data, so change it there first and keep these in step.
 */

/** 1–5 stars. A link that is not rated has rating null. */
export type Rating = 1 | 2 | 3 | 4 | 5

export interface Category {
  id: string
  name: string
  /** null for a top-level category; otherwise the id of its parent (a subcategory). */
  parentId: string | null
  createdAt: string
  updatedAt: string
}

export interface LinkItem {
  id: string
  title: string
  url: string
  description: string | null
  /** Rich text notes as a sanitized HTML fragment (e.g. related sub-links); null = none. */
  notes: string | null
  /** Category or subcategory the link lives in; null = unsorted. */
  categoryId: string | null
  /** null = not rated. */
  rating: Rating | null
  /** ISO timestamp of when the link was added. */
  createdAt: string
  updatedAt: string
}

/* ---------- Request bodies ---------- */

export interface CreateLinkInput {
  title: string
  url: string
  description?: string | null
  notes?: string | null
  categoryId?: string | null
  rating?: Rating | null
}
export type UpdateLinkInput = Partial<CreateLinkInput>

export interface CreateCategoryInput {
  name: string
  parentId?: string | null
}
export type UpdateCategoryInput = Partial<CreateCategoryInput>

/* ---------- Response envelopes (mock-data/README.md) ---------- */

export interface DataResponse<T> {
  data: T
}
export interface ListResponse<T> {
  data: T[]
  meta: { total: number }
}
export interface DeleteCategoryResult {
  id: string
  deletedCategoryIds: string[]
  movedLinkIds: string[]
  movedTo: string | null
}

/* ---------- Bulk import (spec 002) ---------- */

export interface BulkImportInput {
  /** Entries separated by blank lines: title, url, then optional description lines. */
  text: string
  /** Category every imported link is filed in; null = unsorted. */
  categoryId: string | null
}
export interface BulkImportSkipped {
  /** 1-based position of the entry in the text. */
  entry: number
  /** 1-based line number where the entry starts. */
  line: number
  title: string
  url: string
  code: ErrorCode
  /** Why it was skipped, ready to show to the user. */
  message: string
}
export interface BulkImportResult {
  created: LinkItem[]
  skipped: BulkImportSkipped[]
}

/* ---------- Export and import (spec 004) ---------- */

export const EXPORT_FORMAT = 'link-organizer-export'
export const EXPORT_VERSION = 1

/** A backup file: every category (parents first) and every link (oldest first). */
export interface ExportDocument {
  format: typeof EXPORT_FORMAT
  version: typeof EXPORT_VERSION
  /** ISO timestamp of when the file was made. */
  exportedAt: string
  counts: { categories: number; links: number }
  categories: Category[]
  links: LinkItem[]
}

export interface ImportSkippedCategory {
  /** 1-based position in the file's `categories` array. */
  index: number
  name: string
  code: ErrorCode
  message: string
}
export interface ImportSkippedLink {
  /** 1-based position in the file's `links` array. */
  index: number
  title: string
  url: string
  code: ErrorCode
  message: string
}
export interface ImportResult {
  categories: {
    created: number
    /** Same id already in the database; used as is. */
    existing: number
    /** Same name already under the same parent; merged into that category. */
    merged: number
    skipped: ImportSkippedCategory[]
  }
  links: { created: number; skipped: ImportSkippedLink[] }
}

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'DUPLICATE_URL'
  | 'DUPLICATE_CATEGORY'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'

export interface FieldError {
  field: string
  message: string
}
export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: FieldError[] }
}

/* ---------- Field limits (mock-data/models.json) ---------- */

export const LIMITS = {
  category: { nameMaxLength: 80 },
  link: { titleMaxLength: 200, urlMaxLength: 2048, descriptionMaxLength: 2000, notesMaxLength: 20_000, ratingMin: 1, ratingMax: 5 },
  bulkImport: { maxEntries: 1000, maxTextLength: 1_000_000 },
  dataImport: { maxCategories: 5000, maxLinks: 20_000 },
} as const
