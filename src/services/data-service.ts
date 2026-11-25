import type { DataSource } from 'typeorm'
import { CategoryEntity } from '../entities/CategoryEntity'
import { hashUrl, LinkEntity } from '../entities/LinkEntity'
import { checkDocument, planCategories, planLinks } from '../lib/data-import'
import { EXPORT_FORMAT, EXPORT_VERSION, type Category, type ExportDocument, type ImportResult } from '../types'
import type { ThumbnailService } from './thumbnail-service'

/** Parents before children; siblings keep their order. Anything in a cycle goes last. */
function parentsFirst(categories: Category[]): Category[] {
  const ordered: Category[] = []
  const placed = new Set<string>()
  const ids = new Set(categories.map((c) => c.id))
  let pending = categories
  for (let progressed = true; pending.length && progressed; ) {
    progressed = false
    const waiting: Category[] = []
    for (const c of pending) {
      if (c.parentId === null || !ids.has(c.parentId) || placed.has(c.parentId)) {
        ordered.push(c)
        placed.add(c.id)
        progressed = true
      } else waiting.push(c)
    }
    pending = waiting
  }
  return [...ordered, ...pending]
}

/** Export and import of all data as one file (spec 004). */
export class DataService {
  constructor(
    private readonly db: DataSource,
    private readonly thumbnails: ThumbnailService,
  ) {}

  /** Every category and link, in the format import reads. */
  async export(): Promise<ExportDocument> {
    const [categories, links] = await this.db.transaction(async (em) =>
      Promise.all([
        em.find(CategoryEntity, { order: { createdAt: 'ASC', name: 'ASC' } }),
        em.find(LinkEntity, { order: { createdAt: 'ASC' } }),
      ]),
    )
    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      counts: { categories: categories.length, links: links.length },
      categories: parentsFirst(categories.map((c) => c.toJSON())),
      links: links.map((l) => l.toJSON()),
    }
  }

  /**
   * Merges an export file into the database. Existing data is never changed. Each item
   * is saved on its own, so importing the same file again creates nothing and a retry
   * after a failure part-way through is safe.
   */
  async import(body: unknown): Promise<ImportResult> {
    const doc = checkDocument(body)
    const em = this.db.manager

    const existingCategories = await em.find(CategoryEntity, { select: { id: true, name: true, parentId: true } })
    const categories = planCategories(doc.categories, existingCategories)
    for (const category of categories.create) {
      await em.insert(CategoryEntity, category)
    }

    const existingLinks = await em.find(LinkEntity, { select: { id: true, url: true, title: true } })
    const links = planLinks(
      doc.links,
      { ids: new Set(existingLinks.map((l) => l.id)), urls: new Map(existingLinks.map((l) => [l.url, l.title])) },
      categories.resolve,
    )

    const skipped = [...links.skipped]
    let created = 0
    for (const { index, link } of links.create) {
      try {
        await em.insert(LinkEntity, { ...link, urlHash: hashUrl(link.url) })
      } catch (error) {
        // Saved by someone else since the plan was made: same outcome as a duplicate in the plan.
        const e = error as { code?: string; driverError?: { code?: string } }
        if ((e?.driverError?.code ?? e?.code) !== 'ER_DUP_ENTRY') throw error
        skipped.push({ index, title: link.title, url: link.url, code: 'DUPLICATE_URL', message: 'This link is already saved.' })
        continue
      }
      created++
      // A restore onto the same server may find the thumbnail still on disk.
      if (!(await this.thumbnails.find(link.id))) this.thumbnails.generateInBackground(link.id, link.url)
    }

    return {
      categories: {
        created: categories.create.length,
        existing: categories.existing,
        merged: categories.merged,
        skipped: categories.skipped,
      },
      links: { created, skipped: skipped.sort((a, b) => a.index - b.index) },
    }
  }
}
