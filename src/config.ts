import dotenv from 'dotenv'

/*
 * Loads the dotenv file named by DOTENV_CONFIG_PATH (bin/startup.sh points it at
 * /etc/app-configs/link-mgmnt/.env), falling back to ./.env for local development.
 * Variables already set in the environment win over the file.
 */
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH ?? '.env', quiet: true })

const str = (key: string, fallback?: string): string => {
  const value = process.env[key]
  if (value !== undefined && value !== '') return value
  if (fallback !== undefined) return fallback
  throw new Error(`Missing required environment variable ${key}`)
}

const int = (key: string, fallback: number): number => {
  const value = Number(process.env[key] ?? fallback)
  if (!Number.isInteger(value)) throw new Error(`Environment variable ${key} must be an integer`)
  return value
}

const bool = (key: string, fallback: boolean): boolean => {
  const value = process.env[key]
  return value === undefined || value === '' ? fallback : /^(1|true|yes)$/i.test(value)
}

const dbType = str('DB_CONNECTION', 'mariadb')
if (dbType !== 'mariadb' && dbType !== 'mysql') {
  throw new Error(`DB_CONNECTION must be "mariadb" or "mysql", got "${dbType}"`)
}

export const config = {
  server: {
    host: str('HOST', '127.0.0.1'),
    port: int('PORT', 3000),
    /** Comma-separated list of allowed origins; "*" allows any. */
    corsOrigins: str('CORS_ORIGIN', 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174').split(',').map((s) => s.trim()),
  },
  db: {
    type: dbType as 'mariadb' | 'mysql',
    host: str('DB_HOST', '127.0.0.1'),
    port: int('DB_PORT', 3306),
    database: str('DB_DATABASE', 'link_mgmnt'),
    username: str('DB_USERNAME', 'link_mgmnt'),
    password: str('DB_PASSWORD', ''),
    /** Apply pending migrations at startup. */
    migrationsRun: bool('DB_MIGRATIONS_RUN', true),
    /** Let TypeORM alter the schema to match the entities. Development only — never with real data. */
    synchronize: bool('DB_SYNCHRONIZE', false),
    logging: bool('DB_LOGGING', false),
  },
}
