import { randomUUID } from 'node:crypto'
import type { DataSource, EntityManager } from 'typeorm'
import { CategoryEntity } from '../entities/CategoryEntity'
import { hashUrl, LinkEntity } from '../entities/LinkEntity'
import { ApiError } from '../errors/api-error'
import { isHttpUrl, isUuid, requireObject } from '../lib/validation'
import { parseBulkLinks } from '../lib/bulk-import'
import { LIMITS, type BulkImportResult, type FieldError, type Rating } from '../types'
import type { ThumbnailService } from './thumbnail-service'

type LinkFields = Partial<Pick<LinkEntity, 'title' | 'url' | 'description' | 'categoryId' | 'rating'>>

export class LinkService {
  constructor(
    private readonly db: DataSource,
    private readonly thumbnails: ThumbnailService,
  ) {}

  /** Every saved link, newest first. */
  list(): Promise<LinkEntity[]> {
    return this.db.getRepository(LinkEntity).find({ order: { createdAt: 'DESC' } })
  }

  get(id: string): Promise<LinkEntity> {
    return this.find(this.db.manager, id)
  }

  /**
   * Saves the link, then starts generating its thumbnail in the background. The
   * response doesn't wait for the thumbnail, and a failed thumbnail doesn't fail the create.
   */
  async create(body: unknown): Promise<LinkEntity> {
    const link = await this.db.transaction(async (em) => {
      const clean = await this.validate(em, requireObject(body), null)
      const entity = em.create(LinkEntity, {
        id: randomUUID(),
        title: clean.title!,
        url: clean.url!,
        description: clean.description ?? null,
        categoryId: clean.categoryId ?? null,
        rating: clean.rating ?? null,
      })
      return em.save(entity)
    })
    this.thumbnails.generateInBackground(link.id, link.url)
    return link
  }

  /**
   * Bulk import (spec 002). Parses `text` into entries and files every one in
   * `categoryId`. Each entry is created on its own, with the same rules as a single
   * create: invalid entries and URLs that are already saved (or repeated earlier in
   * the same text) are skipped and reported, and the rest are still created. That
   * makes a retry after a partial failure safe.
   */
  async import(body: unknown): Promise<BulkImportResult> {
    const input = requireObject(body)
    const details: FieldError[] = []
    const { maxEntries, maxTextLength } = LIMITS.bulkImport

    if (typeof input.text !== 'string' || !input.text.trim())
      details.push({ field: 'text', message: 'Paste at least one link to import.' })
    else if (input.text.length > maxTextLength)
      details.push({ field: 'text', message: `That's too much text for one import. Split it into smaller batches.` })

    const missingCategory = { field: 'categoryId', message: 'That category no longer exists. Pick another.' }
    let categoryId: string | null = null
    if (input.categoryId === undefined)
      details.push({ field: 'categoryId', message: 'Pick a category for the imported links, or send null for unsorted.' })
    else if (input.categoryId !== null) {
      if (!isUuid(input.categoryId)) details.push(missingCategory)
      else {
        categoryId = input.categoryId.toLowerCase()
        if (!(await this.db.manager.existsBy(CategoryEntity, { id: categoryId }))) details.push(missingCategory)
      }
    }
    if (details.length) throw new ApiError('VALIDATION_FAILED', details)

    const entries = parseBulkLinks(input.text as string)
    if (entries.length > maxEntries)
      throw new ApiError('VALIDATION_FAILED', [
        { field: 'text', message: `Import at most ${maxEntries} links at a time; this has ${entries.length}.` },
      ])

    const result: BulkImportResult = { created: [], skipped: [] }
    for (const entry of entries) {
      try {
        const link = await this.create({ title: entry.title, url: entry.url, description: entry.description, categoryId })
        result.created.push(link.toJSON())
      } catch (error) {
        // Anything other than a rule violation (e.g. the database going away) stops the import.
        if (!(error instanceof ApiError) || error.status >= 500) throw error
        result.skipped.push({
          entry: entry.entry,
          line: entry.line,
          title: entry.title,
          url: entry.url,
          code: error.code,
          message: error.details?.map((d) => d.message).join(' ') || error.message,
        })
      }
    }
    return result
  }

  /** Path of the link's stored thumbnail. NOT_FOUND if the link doesn't exist or has no thumbnail yet. */
  async thumbnailPath(id: string): Promise<string> {
    await this.find(this.db.manager, id)
    const file = await this.thumbnails.find(id)
    if (!file) throw new ApiError('NOT_FOUND', undefined, 'This link has no thumbnail yet.')
    return file
  }

  update(id: string, body: unknown): Promise<LinkEntity> {
    return this.db.transaction(async (em) => {
      const current = await this.find(em, id)
      const clean = await this.validate(em, requireObject(body), current)
      Object.assign(current, clean)
      return em.save(current)
    })
  }

  async delete(id: string): Promise<void> {
    await this.db.transaction(async (em) => {
      await this.find(em, id)
      await em.delete(LinkEntity, { id })
    })
    // The link is gone either way; a leftover file only wastes space.
    await this.thumbnails.remove(id).catch((error: unknown) => console.warn(`[thumbnails] couldn't remove ${id}:`, error))
  }

  /* ----- Internals ----- */

  private async find(em: EntityManager, id: string): Promise<LinkEntity> {
    const found = await em.findOneBy(LinkEntity, { id })
    if (!found) throw new ApiError('NOT_FOUND')
    return found
  }

  /** Applies the rules in mock-data/links/{create,update}.json. Returns only the fields that were sent, cleaned. */
  private async validate(em: EntityManager, input: Record<string, unknown>, current: LinkEntity | null): Promise<LinkFields> {
    const { titleMaxLength, urlMaxLength, descriptionMaxLength, ratingMin, ratingMax } = LIMITS.link
    const details: FieldError[] = []
    const clean: LinkFields = {}
    const isCreate = current === null

    if (isCreate || input.title !== undefined) {
      const title = typeof input.title === 'string' ? input.title.trim() : ''
      if (!title) details.push({ field: 'title', message: 'Add a title so you can find this link later.' })
      else if (title.length > titleMaxLength)
        details.push({ field: 'title', message: `Keep the title under ${titleMaxLength} characters.` })
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

    if (input.categoryId !== undefined) {
      const missing = { field: 'categoryId', message: 'That category no longer exists. Pick another.' }
      if (input.categoryId === null) clean.categoryId = null
      else if (!isUuid(input.categoryId)) details.push(missing)
      else {
        const categoryId = input.categoryId.toLowerCase()
        if (!(await em.existsBy(CategoryEntity, { id: categoryId }))) details.push(missing)
        clean.categoryId = categoryId
      }
    }

    if (input.rating !== undefined) {
      const rating = input.rating
      if (rating === null) clean.rating = null
      else if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < ratingMin || rating > ratingMax)
        details.push({ field: 'rating', message: `Rating must be a whole number from ${ratingMin} to ${ratingMax}, or null for not rated.` })
      else clean.rating = rating as Rating
    }

    if (details.length) throw new ApiError('VALIDATION_FAILED', details)

    if (clean.url) {
      const clash = await em.findOneBy(LinkEntity, { urlHash: hashUrl(clean.url) })
      if (clash && clash.id !== current?.id)
        throw new ApiError('DUPLICATE_URL', [{ field: 'url', message: `Already saved as "${clash.title}".` }])
    }
    return clean
  }
}
