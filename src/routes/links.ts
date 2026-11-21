import { Router } from 'express'
import type { LinkService } from '../services/link-service'
import { requireIdParam } from '../lib/validation'

/** /api/links — mock-data/links/*.json */
export function linksRouter(links: LinkService): Router {
  const router = Router()

  router.get('/', async (_req, res) => {
    const data = await links.list()
    res.json({ data, meta: { total: data.length } })
  })

  router.get('/:id', async (req, res) => {
    res.json({ data: await links.get(requireIdParam(req.params.id)) })
  })

  /** The link's thumbnail image (WebP), served from THUMBNAIL_DIR. 404 until one has been generated. */
  router.get('/:id/thumbnail', async (req, res) => {
    const file = await links.thumbnailPath(requireIdParam(req.params.id))
    res.type('image/webp')
    res.sendFile(file)
  })

  router.post('/', async (req, res) => {
    res.status(201).json({ data: await links.create(req.body) })
  })

  router.patch('/:id', async (req, res) => {
    res.json({ data: await links.update(requireIdParam(req.params.id), req.body) })
  })

  router.delete('/:id', async (req, res) => {
    await links.delete(requireIdParam(req.params.id))
    res.status(204).end()
  })

  return router
}
