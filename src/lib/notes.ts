import sanitizeHtml from 'sanitize-html'

/**
 * Rich text notes (spec 003). Notes are an HTML fragment written in the UI's editor.
 * They're sanitized against this allowlist before they're stored, so anything the API
 * returns is safe to render. Keep it in step with the UI's src/lib/notes.ts.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'blockquote', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'hr'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    // Every link opens in a new tab without giving the page a handle on the app.
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...(attribs.href ? { href: attribs.href } : {}),
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    }),
  },
}

/** Empty paragraphs the editor leaves at the end (e.g. after pressing Enter). */
const TRAILING_EMPTY = /(?:\s*<p>\s*(?:<br\s*\/?>)?\s*<\/p>)+$/

/** Sanitized notes, or null when nothing worth keeping is left (no text and no links). */
export function sanitizeNotes(html: string): string | null {
  const clean = sanitizeHtml(html, OPTIONS).trim().replace(TRAILING_EMPTY, '')
  const text = sanitizeHtml(clean, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;|\s/g, '')
  if (!text && !/<a\s[^>]*href=/i.test(clean)) return null
  return clean
}
