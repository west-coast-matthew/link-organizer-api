status: completed

# 003 — add rich text notes to link definitions

## Summary

Until now a link definition described a single link. A link now acts as a *parent* link
(for example `https://www.wonderfull.co`), and we need somewhere to record related
material under it, including sub-links such as the site's "Careers" and "About" pages.

Add an optional `notes` attribute to links. Notes are rich text (HTML) written in the UI's
rich text editor, and can contain formatted text, lists and hyperlinks. The UI work is
covered by link-organizer-ui spec 007.

## Requirements

1. **Model.** Add `notes: string | null` to `LinkItem`, `CreateLinkInput` and `UpdateLinkInput`
   (`src/types/index.ts`) and to `LinkEntity`. Default `null`. Existing links get `null`.
2. **Storage.** New migration adding a nullable `MEDIUMTEXT` column `notes` to `links`
   (TEXT is too small for the limit below in utf8mb4). Register it in `src/data-source.ts`.
3. **Format.** `notes` is an HTML fragment. On create and update the service sanitizes it
   against an allowlist before storing, so stored notes are always safe to render:
   - Allowed tags: `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `s`, `code`, `pre`, `blockquote`,
     `h3`, `h4`, `ul`, `ol`, `li`, `a`, `hr`.
   - Allowed attributes: `href` on `a` only. `href` schemes: `http`, `https`, `mailto`.
     Every `a` is stored with `target="_blank"` and `rel="noopener noreferrer"`.
   - Everything else (scripts, styles, event handlers, other attributes) is stripped.
4. **Empty notes.** After sanitizing, notes with no visible text and no links (for example
   `<p></p>` or whitespace) are stored as `null`. Sending `notes: null` clears them.
5. **Validation.** `notes` must be a string or `null`, otherwise `VALIDATION_FAILED` on `notes`.
   Maximum 20 000 characters after sanitizing, otherwise `VALIDATION_FAILED` on `notes`
   ("Keep the notes under 20000 characters.").
6. **Responses.** Every endpoint that returns a link (`GET /api/links`, `GET /api/links/:id`,
   `POST /api/links`, `PATCH /api/links/:id`, `POST /api/links/import`) includes `notes`.
7. **Bulk import** is unchanged: imported links get `notes: null`.
8. **Docs.** Update `docs/API.md` and `README.md` (Notes section) to describe the field and
   its sanitizing rules. The contract source of truth (`../link-organizer-ui/mock-data`) is
   updated by UI spec 007.

## Acceptance criteria

- `npm run typecheck` and `npm run build` pass; the migration applies and reverts cleanly.
- `POST /api/links` with `notes: "<p>See <a href=\"https://wonderfull.co/careers\">Careers</a></p><script>x</script>"`
  stores and returns the paragraph and link with `target="_blank" rel="noopener noreferrer"`, and no script.
- `javascript:` links lose their `href`; `onclick` and `style` attributes are removed.
- `notes: "<p> </p>"` and `notes: null` both result in `notes: null`.
- `notes: 42` and notes over 20 000 characters return `VALIDATION_FAILED` with `field: "notes"`.
- A PATCH without `notes` leaves existing notes untouched.
