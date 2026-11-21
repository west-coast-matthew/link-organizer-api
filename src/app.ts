import cors from 'cors'
import express, { type Express } from 'express'
import type { DataSource } from 'typeorm'
import { config } from './config'
import { errorHandler, notFound } from './middleware/error-handler'
import { categoriesRouter } from './routes/categories'
import { linksRouter } from './routes/links'
import { CategoryService } from './services/category-service'
import { LinkService } from './services/link-service'

export function createApp(dataSource: DataSource): Express {
  const app = express()
  const { corsOrigins } = config.server

  app.disable('x-powered-by')
  app.use(cors({ origin: corsOrigins.includes('*') ? true : corsOrigins }))
  app.use(express.json({ limit: '100kb' }))

  app.get('/health', (_req, res) => {
    res.status(dataSource.isInitialized ? 200 : 503).json({ status: dataSource.isInitialized ? 'ok' : 'unavailable' })
  })

  app.use('/api/categories', categoriesRouter(new CategoryService(dataSource)))
  app.use('/api/links', linksRouter(new LinkService(dataSource)))

  app.use(notFound)
  app.use(errorHandler)
  return app
}
