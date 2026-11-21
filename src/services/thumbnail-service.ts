import ogs from 'open-graph-scraper';
import sharp from 'sharp';

async function getThumbnailBuffer(targetUrl: string): Promise<Buffer> {
  // 1. Try Open Graph first
  const { result } = await ogs({ url: targetUrl, timeout: 5000 });
  const ogImageUrl = result.ogImage?.[0]?.url;

  let rawImageBuffer: Buffer;

  if (ogImageUrl) {
    const res = await fetch(ogImageUrl);
    rawImageBuffer = Buffer.from(await res.arrayBuffer());
  } else {
    // 2. Fallback to a screenshot API (e.g., ScreenshotOne / Microlink)
    const apiUrl = `https://microlink.io{encodeURIComponent(targetUrl)}&screenshot=true&meta=false&embed=screenshot.url`;
    const res = await fetch(apiUrl);
    rawImageBuffer = Buffer.from(await res.arrayBuffer());
  }

  // 3. Optimize before saving to S3/R2
  return sharp(rawImageBuffer)
    .resize(640, 360, { fit: 'cover' })
    .webp({ quality: 80 })
    .toBuffer();
}
