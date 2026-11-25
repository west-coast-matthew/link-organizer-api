import cors from 'cors'
import express, { type Express } from 'express'
import type { DataSource } from 'typeorm'
import { config } from './config'
import { errorHandler, notFound } from './middleware/error-handler'
import { categoriesRouter } from './routes/categories'
import { dataRouter } from './routes/data'
import { linksRouter } from './routes/links'
import { CategoryService } from './services/category-service'
import { DataService } from './services/data-service'
import { LinkService } from './services/link-service'
import type { ThumbnailService } from './services/thumbnail-service'

export function createApp(dataSource: DataSource, thumbnails: ThumbnailService): Express {
  const app = express()
  const { corsOrigins } = config.server

  app.disable('x-powered-by')
  app.disable('etag')
  app.use(cors({ origin: corsOrigins.includes('*') ? true : corsOrigins }))
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  // Bulk import bodies carry up to ~1 MB of pasted text; everything else stays small.
  app.use('/api/links/import', express.json({ limit: '2mb' }))
  // A data import body is a whole backup file: up to 20,000 links with notes.
  app.use('/api/import', express.json({ limit: '50mb' }))
  app.use(express.json({ limit: '100kb' }))

  app.get('/health', (_req, res) => {
    res.status(dataSource.isInitialized ? 200 : 503).json({ status: dataSource.isInitialized ? 'ok' : 'unavailable' })
  })

  app.use('/api/categories', categoriesRouter(new CategoryService(dataSource)))
  app.use('/api/links', linksRouter(new LinkService(dataSource, thumbnails)))
  app.use('/api', dataRouter(new DataService(dataSource, thumbnails)))

  app.use(notFound)
  app.use(errorHandler)
  return app
}
