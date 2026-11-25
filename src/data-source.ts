import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { config } from './config'
import { CategoryEntity } from './entities/CategoryEntity'
import { LinkEntity } from './entities/LinkEntity'
import { InitialSchema1763740800000 } from './migrations/1763740800000-InitialSchema'
import { AddLinkNotes1764000000000 } from './migrations/1764000000000-AddLinkNotes'

/** The app's DataSource. Also the default export the TypeORM CLI uses (`npm run typeorm -- ...`). */
export const dataSource = new DataSource({
  type: config.db.type,
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  username: config.db.username,
  password: config.db.password,
  charset: 'utf8mb4_unicode_ci',
  // Store and read DATETIME values as UTC so the API's ISO timestamps round-trip.
  timezone: 'Z',
  entities: [CategoryEntity, LinkEntity],
  migrations: [InitialSchema1763740800000, AddLinkNotes1764000000000],
  migrationsRun: config.db.migrationsRun,
  synchronize: config.db.synchronize,
  logging: config.db.logging,
})

export default dataSource
