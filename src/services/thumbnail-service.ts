import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ogs from 'open-graph-scraper'
import sharp from 'sharp'

const FETCH_TIMEOUT_MS = 10_000
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const WIDTH = 640
const HEIGHT = 360
const BACKGROUND_CONCURRENCY = 3

/** Fetches a URL and returns its body, refusing non-2xx responses, non-images and oversized bodies. */
async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow' })
  if (!res.ok) throw new Error(`image request failed: ${res.status} ${url}`)
  const type = res.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) throw new Error(`not an image (${type || 'no content-type'}): ${url}`)
  const length = Number(res.headers.get('content-length') ?? 0)
  if (length > MAX_IMAGE_BYTES) throw new Error(`image too large (${length} bytes): ${url}`)
  const body = Buffer.from(await res.arrayBuffer())
  if (body.length > MAX_IMAGE_BYTES) throw new Error(`image too large (${body.length} bytes): ${url}`)
  return body
}

const isHttp = (u: URL) => u.protocol === 'http:' || u.protocol === 'https:'

/**
 * Generates a 640×360 WebP thumbnail for a link and stores it as `<linkId>.webp`
 * in the configured directory (THUMBNAIL_DIR).
 *
 * Source image: the page's Open Graph image if it has one; otherwise a screenshot
 * from the Microlink API (which sends the link's URL to microlink.io).
 */
export class ThumbnailService {
  constructor(private readonly dir: string) {}

  /** Creates the thumbnail directory if it's missing. */
  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true })
  }

  fileName(linkId: string): string {
    return `${linkId}.webp`
  }

  /** Absolute path of the stored thumbnail, or null if there isn't one. */
  async find(linkId: string): Promise<string | null> {
    const file = path.join(this.dir, this.fileName(linkId))
    try {
      return (await stat(file)).isFile() ? file : null
    } catch {
      return null
    }
  }

  /** Builds and stores the thumbnail. Throws if no image could be produced. */
  async generate(linkId: string, targetUrl: string): Promise<string> {
    const image = await sharp(await this.sourceImage(targetUrl))
      .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'attention' })
      .webp({ quality: 80 })
      .toBuffer()

    // Write to a temp file, then rename, so readers never see a half-written image.
    const file = path.join(this.dir, this.fileName(linkId))
    const tmp = `${file}.${process.pid}.tmp`
    await writeFile(tmp, image)
    await rename(tmp, file)
    return file
  }

  /**
   * Fire-and-forget generation: queues the job, logs the outcome and never throws.
   * At most BACKGROUND_CONCURRENCY jobs run at once, so a bulk import doesn't open
   * hundreds of connections (or hit the screenshot API's rate limit) at the same time.
   */
  generateInBackground(linkId: string, targetUrl: string): void {
    this.queue.push({ linkId, targetUrl })
    this.drain()
  }

  private readonly queue: { linkId: string; targetUrl: string }[] = []
  private running = 0

  private drain(): void {
    while (this.running < BACKGROUND_CONCURRENCY && this.queue.length) {
      const { linkId, targetUrl } = this.queue.shift()!
      const started = Date.now()
      this.running++
      this.generate(linkId, targetUrl)
        .then(
          () => console.info(`[thumbnails] ${linkId} ready (${Date.now() - started} ms) ${targetUrl}`),
          (error: unknown) =>
            console.warn(`[thumbnails] ${linkId} failed for ${targetUrl}: ${error instanceof Error ? error.message : error}`),
        )
        .finally(() => {
          this.running--
          this.drain()
        })
    }
  }

  async remove(linkId: string): Promise<void> {
    await rm(path.join(this.dir, this.fileName(linkId)), { force: true })
  }

  /* ----- Internals ----- */

  private async sourceImage(targetUrl: string): Promise<Buffer> {
    // 1. The page's Open Graph image.
    try {
      const { result } = await ogs({ url: targetUrl, timeout: FETCH_TIMEOUT_MS / 1000 })
      const ogImage = result.ogImage?.[0]?.url
      if (ogImage) {
        // og:image may be relative to the page.
        const imageUrl = new URL(ogImage, targetUrl)
        if (isHttp(imageUrl)) return await fetchImage(imageUrl.href)
      }
    } catch (error) {
      console.info(`[thumbnails] no usable og:image for ${targetUrl}: ${error instanceof Error ? error.message : error}`)
    }

    // 2. Fall back to a screenshot of the page.
    const api = new URL('https://api.microlink.io/')
    api.searchParams.set('url', targetUrl)
    api.searchParams.set('screenshot', 'true')
    api.searchParams.set('meta', 'false')
    api.searchParams.set('embed', 'screenshot.url')
    return fetchImage(api.href)
  }
}
