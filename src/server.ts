import 'reflect-metadata'
import { config } from './config'
import { dataSource } from './data-source'
import { createApp } from './app'

async function main() {
  const { db, server } = config
  console.info(`[api] connecting to ${db.type} at ${db.host}:${db.port}/${db.database}`)
  await dataSource.initialize()

  const httpServer = createApp(dataSource).listen(server.port, server.host, () => {
    console.info(`[api] listening on http://${server.host}:${server.port}`)
  })

  const shutdown = (signal: string) => {
    console.info(`[api] ${signal} received, shutting down`)
    httpServer.close(() => {
      dataSource.destroy().finally(() => process.exit(0))
    })
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((error) => {
  console.error('[api] failed to start:', error)
  process.exit(1)
})
