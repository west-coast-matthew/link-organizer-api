import { Router } from 'express'
import type { DataService } from '../services/data-service'

/** /api/export and /api/import (spec 004). */
export function dataRouter(data: DataService): Router {
  const router = Router()

  /** The body is the backup file itself, not wrapped in { data }. */
  router.get('/export', async (_req, res) => {
    const doc = await data.export()
    const date = doc.exportedAt.slice(0, 10)
    res.attachment(`link-organizer-backup-${date}.json`)
    res.json(doc)
  })

  /** 201 if anything was created, otherwise 200. */
  router.post('/import', async (req, res) => {
    const result = await data.import(req.body)
    const created = result.categories.created + result.links.created
    const body = req.body as { categories: unknown[]; links: unknown[] }
    res.status(created ? 201 : 200).json({
      data: result,
      meta: { categories: body.categories.length, links: body.links.length },
    })
  })

  return router
}
