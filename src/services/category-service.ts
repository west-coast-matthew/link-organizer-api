import { randomUUID } from 'node:crypto'
import { In, IsNull, type DataSource, type EntityManager } from 'typeorm'
import { CategoryEntity } from '../entities/CategoryEntity'
import { LinkEntity } from '../entities/LinkEntity'
import { ApiError } from '../errors/api-error'
import { isUuid, requireObject } from '../lib/validation'
import { LIMITS, type DeleteCategoryResult, type FieldError } from '../types'

/** Case-insensitive, accent-sensitive — the same comparison the UI uses. */
const sameText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0

/** The id plus every descendant id of a category. */
export function subtree(categories: Pick<CategoryEntity, 'id' | 'parentId'>[], rootId: string): Set<string> {
  const ids = new Set([rootId])
  for (let grew = true; grew; ) {
    grew = false
    for (const c of categories) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id)
        grew = true
      }
    }
  }
  return ids
}

export class CategoryService {
  constructor(private readonly db: DataSource) {}

  list(): Promise<CategoryEntity[]> {
    return this.db.getRepository(CategoryEntity).find({ order: { createdAt: 'ASC', name: 'ASC' } })
  }

  get(id: string): Promise<CategoryEntity> {
    return this.find(this.db.manager, id)
  }

  create(body: unknown): Promise<CategoryEntity> {
    return this.db.transaction(async (em) => {
      const input = requireObject(body)
      const { name, parentId } = await this.validate(em, input, null)
      const category = em.create(CategoryEntity, { id: randomUUID(), name: name!, parentId })
      return em.save(category)
    })
  }

  update(id: string, body: unknown): Promise<CategoryEntity> {
    return this.db.transaction(async (em) => {
      const current = await this.find(em, id)
      const input = requireObject(body)
      const { name, parentId } = await this.validate(em, input, current)
      if (name !== undefined) current.name = name
      current.parentId = parentId
      return em.save(current)
    })
  }

  /**
   * Deletes the category and its whole subtree. Links anywhere in the subtree move to
   * the deleted category's parent (or become unsorted if it was top-level).
   */
  delete(id: string): Promise<DeleteCategoryResult> {
    return this.db.transaction(async (em) => {
      const target = await this.find(em, id)
      const all = await em.find(CategoryEntity, { select: { id: true, parentId: true } })
      const doomed = [...subtree(all, id)]

      const moved = await em.find(LinkEntity, { select: { id: true }, where: { categoryId: In(doomed) } })
      const movedLinkIds = moved.map((l) => l.id)
      if (movedLinkIds.length) {
        await em.update(LinkEntity, { id: In(movedLinkIds) }, { categoryId: target.parentId })
      }
      await em.delete(CategoryEntity, { id: In(doomed) })

      return { id, deletedCategoryIds: doomed, movedLinkIds, movedTo: target.parentId }
    })
  }

  /* ----- Internals ----- */

  private async find(em: EntityManager, id: string): Promise<CategoryEntity> {
    const found = await em.findOneBy(CategoryEntity, { id })
    if (!found) throw new ApiError('NOT_FOUND')
    return found
  }

  /** Applies the rules in mock-data/categories/{create,update}.json. Returns the trimmed name if sent, and the effective parentId. */
  private async validate(
    em: EntityManager,
    input: Record<string, unknown>,
    current: CategoryEntity | null,
  ): Promise<{ name: string | undefined; parentId: string | null }> {
    const details: FieldError[] = []
    const isCreate = current === null
    let name: string | undefined
    let parentId: string | null = current?.parentId ?? null

    if (isCreate || input.name !== undefined) {
      if (input.name !== undefined && typeof input.name !== 'string') {
        details.push({ field: 'name', message: 'Give the category a name.' })
      } else {
        name = (input.name as string | undefined)?.trim() ?? ''
        if (!name) details.push({ field: 'name', message: 'Give the category a name.' })
        else if (name.length > LIMITS.category.nameMaxLength)
          details.push({ field: 'name', message: `Keep the name under ${LIMITS.category.nameMaxLength} characters.` })
      }
    }

    if (input.parentId !== undefined) {
      if (input.parentId === null) parentId = null
      else if (!isUuid(input.parentId)) details.push({ field: 'parentId', message: 'The parent category no longer exists.' })
      else parentId = input.parentId.toLowerCase()
    }

    if (parentId !== null && !details.some((d) => d.field === 'parentId')) {
      const all = await em.find(CategoryEntity, { select: { id: true, parentId: true } })
      if (!all.some((c) => c.id === parentId)) {
        details.push({ field: 'parentId', message: 'The parent category no longer exists.' })
      } else if (current && subtree(all, current.id).has(parentId)) {
        details.push({ field: 'parentId', message: "A category can't be moved inside itself." })
      }
    }
    if (details.length) throw new ApiError('VALIDATION_FAILED', details)

    const finalName = name ?? current!.name
    const siblings = await em.find(CategoryEntity, { where: { parentId: parentId ?? IsNull() } })
    const clash = siblings.find((c) => c.id !== current?.id && sameText(c.name, finalName))
    if (clash) {
      const parent = parentId ? await em.findOneBy(CategoryEntity, { id: parentId }) : null
      throw new ApiError('DUPLICATE_CATEGORY', [
        { field: 'name', message: `"${clash.name}" is already in ${parent ? parent.name : 'your top-level categories'}.` },
      ])
    }
    return { name, parentId }
  }
}
