# link-organizer-api

REST backend for [link-organizer-ui](../link-organizer-ui). TypeScript on Node, Express 5, TypeORM, MariaDB.

The API contract is defined in the UI project's `mock-data/` (one JSON file per call, plus
`models.json` and `errors.json`). This service implements those calls and their rules, so the
UI can swap its mock service for real `fetch` calls without changing return types.

## Endpoints

| Method | Path | Success |
| --- | --- | --- |
| GET | `/api/categories` | 200 `{ data: Category[], meta: { total } }` |
| GET | `/api/categories/:id` | 200 `{ data: Category }` |
| POST | `/api/categories` | 201 `{ data: Category }` |
| PATCH | `/api/categories/:id` | 200 `{ data: Category }` |
| DELETE | `/api/categories/:id` | 200 `{ data: DeleteCategoryResult }` — deletes the subtree; its links move to the parent |
| GET | `/api/links` | 200 `{ data: LinkItem[], meta: { total } }` — newest first |
| GET | `/api/links/:id` | 200 `{ data: LinkItem }` |
| POST | `/api/links` | 201 `{ data: LinkItem }` |
| PATCH | `/api/links/:id` | 200 `{ data: LinkItem }` |
| DELETE | `/api/links/:id` | 204 |
| POST | `/api/links/import` | 201/200 `{ data: { created, skipped }, meta }` — bulk import from pasted text into one category |
| GET | `/api/links/:id/thumbnail` | 200 `image/webp` — generated in the background when the link is created |
| GET | `/health` | 200 / 503 |

Errors use the `{ error: { code, message, details? } }` envelope from `mock-data/errors.json`.
Full reference with request examples: [docs/API.md](docs/API.md).

## Layout

```
bin/startup.sh          production launcher (reads /etc/app-configs/link-mgmnt/.env)
src/server.ts           entry point: connect DB, start HTTP
src/app.ts              Express app: CORS, JSON, routes, error handler
src/config.ts           dotenv loading and typed settings
src/data-source.ts      TypeORM DataSource (also used by the TypeORM CLI)
src/types/              contract types, mirrored from the UI's src/types.ts
src/entities/           CategoryEntity, LinkEntity
src/migrations/         schema migrations
src/services/           business rules and validation per resource
src/routes/             thin Express routers
src/middleware/         404 + error-envelope mapping
```

## Configuration

See `.env.example`. `bin/startup.sh` loads `/etc/app-configs/link-mgmnt/.env` (override with
`ENV_FILE=/path/to/file`); `npm run dev` loads `./.env`, or whatever `DOTENV_CONFIG_PATH` names.

## Running

```sh
npm install
bin/startup.sh             # build if needed, apply migrations, serve
bin/startup.sh --build     # force a rebuild first

# development (watch mode, reads ./.env)
cp .env.example .env
npm run dev
```

Migrations run automatically at startup when `DB_MIGRATIONS_RUN=true`. To manage them by hand:

```sh
npm run migration:show
npm run migration:run
npm run migration:revert
npm run typeorm -- migration:generate src/migrations/<Name>   # after changing an entity
```

New migrations must also be added to the `migrations` array in `src/data-source.ts`.

## Notes

- Link URLs are unique. Because a 2048-character column is too wide for an InnoDB unique index,
  uniqueness is enforced on `urlHash` (SHA-256 of the URL), which the entity keeps in sync.
- Ratings are 1–5 stars; `null` means not rated (the default). Send `{ "rating": null }` to clear one.
- Category names are unique among siblings, case-insensitively; the service checks this.
- Thumbnails are stored as `<linkId>.webp` in `THUMBNAIL_DIR`. The source is the page's `og:image`, or
  a Microlink screenshot when there isn't one (this sends the link's URL to microlink.io).
- Timestamps are stored as UTC `DATETIME(3)` and returned as ISO 8601 strings.
