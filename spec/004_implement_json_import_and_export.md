status: completed

# 004 — implement json import and export

## Summary

Let the user export every category and link as a single file, as a backup they own, and
import such a file again to restore it (or to move data between installs). Database backups
remain an option, but this gives a portable, readable backup from the app itself.

The UI work (download button, restore dialog) is covered by link-organizer-ui spec 008.

### Format choice

The file is JSON. Notes are rich text HTML (spec 003), and JSON carries them safely: they
are ordinary strings, and JSON escaping covers quotes, angle brackets and newlines, so no
HTML content can break the file's structure. A custom DSL would need its own escaping rules
and parser, and would be harder to inspect or repair by hand. JSON also matches the API's
own representation, so the file is just the API's `Category` and `LinkItem` objects in an
envelope with a format name and version.

## Requirements

1. **File format (version 1).** A JSON object:

   ```json
   {
     "format": "link-organizer-export",
     "version": 1,
     "exportedAt": "2026-11-25T18:00:00.000Z",
     "counts": { "categories": 1, "links": 1 },
     "categories": [
       { "id": "…", "name": "Food", "parentId": null, "createdAt": "…", "updatedAt": "…" }
     ],
     "links": [
       {
         "id": "…", "title": "Wonderfull", "url": "https://www.wonderfull.co",
         "description": null,
         "notes": "<p>See <a href=\"https://wonderfull.co/careers\" target=\"_blank\" rel=\"noopener noreferrer\">Careers</a></p>",
         "categoryId": "…", "rating": 4, "createdAt": "…", "updatedAt": "…"
       }
     ]
   }
   ```

   - `categories` and `links` use exactly the API's `Category` and `LinkItem` shapes
     (`rating` is 1–5 or `null`; `notes` is sanitized HTML or `null`).
   - Categories are ordered parents before children; links oldest first.
   - Thumbnails are not included; they are regenerated after import.
   - Add the types (`ExportDocument`, `ImportResult`, …) and limits to `src/types/index.ts`.

2. **Export: `GET /api/export`.** Responds 200 with the export document itself as the body
   (not wrapped in `{ data }`, so the response is the backup file), `Content-Type:
   application/json` and `Content-Disposition: attachment; filename="link-organizer-backup-YYYY-MM-DD.json"`
   (UTC date). `counts` matches the array lengths.

3. **Import: `POST /api/import`.** The body is an export document. Its JSON body limit is
   50 MB (other routes keep theirs).
   - **Whole-file checks** reject the request with 400 `VALIDATION_FAILED` and nothing is written:
     - `format` must be `"link-organizer-export"` (field `format`: "This isn't a Link Organizer export file.").
     - `version` must be `1` (field `version`: "This file was made by a newer version of Link Organizer.").
     - `categories` and `links` must be arrays (field `categories` / `links`).
     - At most 5,000 categories and 20,000 links.
   - **Merge, never overwrite.** Existing data is never changed or deleted. Import into an
     empty database is a full restore; import into a populated one merges.
   - **Categories**, parents first:
     - Same `id` already exists → *existing*; it's used as is (not renamed or moved).
     - Otherwise a category with the same name (case-insensitive, as elsewhere) already exists
       under the same parent → *merged*: links and subcategories that pointed at the file's
       id go to the existing one.
     - Otherwise *created* with the file's `id`, `name`, `createdAt` and `updatedAt`.
     - A `parentId` that isn't in the file or the database, or that forms a cycle, makes the
       category top-level.
     - An entry with an invalid id or name (same rules as create) is *skipped* with a reason;
       its children become top-level and its links unsorted.
   - **Links**, in file order:
     - A URL that's already saved, or repeated earlier in the file, is *skipped* with `DUPLICATE_URL`.
     - Same validation as `POST /api/links` (title, URL, description, notes sanitized and
       limited, rating); a failure is *skipped* with `VALIDATION_FAILED` and the message.
     - Keeps the file's `id` when it's a valid UUID not already in use, otherwise gets a new one.
     - `categoryId` follows the category mapping above; unknown → `null` (unsorted).
     - Keeps `createdAt` and `updatedAt` when they're valid ISO timestamps, otherwise now.
     - Thumbnails are generated in the background, as for a single create.
   - Each item is saved on its own (like bulk import), so importing the same file again
     creates nothing, and a retry after a failure part-way through is safe. Errors other
     than rule violations (e.g. the database going away) stop the import.
   - **Response:** 201 if anything was created, otherwise 200:

     ```json
     {
       "data": {
         "categories": { "created": 2, "existing": 0, "merged": 1, "skipped": [] },
         "links": {
           "created": 40,
           "skipped": [
             { "index": 7, "title": "Foo", "url": "http://www.foo.com", "code": "DUPLICATE_URL", "message": "Already saved as \"Foo\"." }
           ]
         }
       },
       "meta": { "categories": 3, "links": 41 }
     }
     ```

     Skipped categories are `{ index, name, code, message }`. `index` is the 1-based
     position in the file's array. `meta` holds the number of entries in the file.

4. **Structure.** Keep the import planning (category mapping, order, cycle handling, field
   checks) in a pure module under `src/lib/` so it can be checked without a database; the
   service in `src/services/` does the reads and writes; a thin router in `src/routes/`.

5. **Docs.** Document both endpoints, the file format and the merge rules in `docs/API.md`,
   and add them to the endpoint tables in `docs/API.md` and `README.md`.

## Acceptance criteria

- `npm run typecheck` and `npm run build` pass.
- `GET /api/export` returns a download with every category and link, notes intact.
- Importing that file into an empty database recreates the same categories (same ids and
  hierarchy) and links (same ids, notes, ratings, categories and timestamps).
- Importing the same file again returns 200 with nothing created and every link skipped as `DUPLICATE_URL`.
- A file with the wrong `format`, an unsupported `version`, or non-array lists is rejected
  with 400 `VALIDATION_FAILED` and writes nothing.
- Notes containing `<script>` or `javascript:` links in an imported file are sanitized as on create.
- A category whose parent is missing becomes top-level; a link whose category is missing becomes unsorted.
