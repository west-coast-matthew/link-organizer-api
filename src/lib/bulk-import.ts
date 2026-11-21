/**
 * Parser for bulk link text (spec 002). Entries are separated by one or more blank
 * lines. Within an entry:
 *
 *   line 1      title
 *   line 2      url
 *   lines 3+    optional description (joined with newlines)
 *
 *   link 1
 *   http://www.somewhere.com
 *
 *   some other link
 *   http://www.foo.com
 *   this is a really great site....
 */

export interface ParsedEntry {
  /** 1-based position of the entry in the text. */
  entry: number
  /** 1-based line number where the entry starts, for error messages. */
  line: number
  title: string
  url: string
  description: string | null
}

export function parseBulkLinks(text: string): ParsedEntry[] {
  const entries: ParsedEntry[] = []
  let block: string[] = []
  let blockStart = 0

  const flush = () => {
    if (!block.length) return
    const [title = '', url = '', ...rest] = block
    const description = rest.join('\n').trim()
    entries.push({ entry: entries.length + 1, line: blockStart, title, url, description: description || null })
    block = []
  }

  text.split(/\r\n|\r|\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line) return flush()
    if (!block.length) blockStart = i + 1
    block.push(line)
  })
  flush()
  return entries
}
