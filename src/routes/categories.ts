import { Router } from 'express'
import type { CategoryService } from '../services/category-service'
import { requireIdParam } from '../lib/validation'

/** /api/categories — mock-data/categories/*.json */
export function categoriesRouter(categories: CategoryService): Router {
  const router = Router()

  router.get('/', async (_req, res) => {
    const data = await categories.list()
    res.json({ data, meta: { total: data.length } })
  })

  router.get('/:id', async (req, res) => {
    res.json({ data: await categories.get(requireIdParam(req.params.id)) })
  })

  router.post('/', async (req, res) => {
    res.status(201).json({ data: await categories.create(req.body) })
  })

  router.patch('/:id', async (req, res) => {
    res.json({ data: await categories.update(requireIdParam(req.params.id), req.body) })
  })

  router.delete('/:id', async (req, res) => {
    res.json({ data: await categories.delete(requireIdParam(req.params.id)) })
  })

  return router
}
