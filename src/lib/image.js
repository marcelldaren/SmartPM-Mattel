/**
 * Turn a picked File into something we can both preview and ship to the model.
 *
 * Phone photos off a plant floor are routinely 4-12 MP, which is far more resolution than
 * a verification judgement needs and enough to bloat the request body. Downscaling the
 * longest edge to 1024px keeps detail like cracks, rust, and fluid streaks clearly legible
 * while cutting the payload by an order of magnitude.
 *
 * Decoding has two paths on purpose. `createImageBitmap` is the fast one but throws on
 * HEIC/HEIF — the default capture format on iPhones — so a failure there falls back to an
 * <img> element, which Safari *can* decode for HEIC. Without that fallback, attaching a
 * photo straight from an iPhone camera roll simply fails.
 */

const MAX_EDGE = 1024
const JPEG_QUALITY = 0.85

// A second, much smaller encode that gets stored alongside the verdict so a supervisor can
// see the photo the model actually judged. Kept tiny because it lives in the database.
const THUMB_EDGE = 220
const THUMB_QUALITY = 0.6

function sizeLabel(base64) {
  const bytes = Math.round(base64.length * 0.75)
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Decode through an <img> tag. Slower, but handles formats createImageBitmap rejects. */
function decodeViaImgElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error('Image decoded with no dimensions'))
        return
      }
      resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Browser could not decode this image format'))
    }
    img.src = url
  })
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      // imageOrientation honours the EXIF rotation phones write, so a photo taken in
      // portrait doesn't arrive sideways.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, bitmap }
    } catch {
      // Falls through to the <img> path — expected for HEIC/HEIF.
    }
  }
  return decodeViaImgElement(file)
}

/**
 * @returns {Promise<{name: string, mime: string, data: string, previewUrl: string, size: string}>}
 *   `data` is bare base64 with no `data:` prefix — the shape the API expects.
 * @throws {Error} with a message safe to show the user.
 */
export async function readImageForUpload(file) {
  if (!file) throw new Error('No file selected')
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('That file is not an image')
  }

  const { source, width: srcW, height: srcH, bitmap } = await decode(file)

  const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH))
  const width = Math.max(1, Math.round(srcW * scale))
  const height = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not prepare the image on this device')
  ctx.drawImage(source, 0, 0, width, height)
  bitmap?.close?.()

  // Re-encoding to JPEG also normalises HEIC/PNG/WebP into one mime the API accepts.
  const previewUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  if (!previewUrl.startsWith('data:image/jpeg')) {
    throw new Error('Could not convert the image on this device')
  }
  const data = previewUrl.slice(previewUrl.indexOf(',') + 1)

  // Second, small encode — stored with the verdict so the photo can be shown beside it.
  const thumbScale = Math.min(1, THUMB_EDGE / Math.max(width, height))
  const thumb = document.createElement('canvas')
  thumb.width = Math.max(1, Math.round(width * thumbScale))
  thumb.height = Math.max(1, Math.round(height * thumbScale))
  thumb.getContext('2d')?.drawImage(canvas, 0, 0, thumb.width, thumb.height)
  const thumbnail = thumb.toDataURL('image/jpeg', THUMB_QUALITY)

  return {
    name: file.name || 'photo.jpg',
    mime: 'image/jpeg',
    data,
    thumbnail,
    previewUrl,
    size: sizeLabel(data),
  }
}

/* ---------------------------------------------------------------------------------- *
 * Paper-checksheet scanning
 *
 * A different job from evidence photos, so a different budget. Judging "is this bearing
 * cracked" survives a 1024px downscale comfortably; deciding whether a 3.7mm checkbox
 * carries a pen tick does not — at 1024px across an A4 page a box is ~18px and the mark
 * inside it is a handful of pixels. 2000px puts it near 35px, which is the difference
 * between reading the form and guessing at it.
 * ---------------------------------------------------------------------------------- */

const SCAN_MAX_EDGE = 2000
const SCAN_QUALITY = 0.9

function encodeScan(source, srcW, srcH) {
  const scale = Math.min(1, SCAN_MAX_EDGE / Math.max(srcW, srcH))
  const width = Math.max(1, Math.round(srcW * scale))
  const height = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not prepare the image on this device')
  ctx.drawImage(source, 0, 0, width, height)

  const previewUrl = canvas.toDataURL('image/jpeg', SCAN_QUALITY)
  if (!previewUrl.startsWith('data:image/jpeg')) {
    throw new Error('Could not convert the image on this device')
  }
  const data = previewUrl.slice(previewUrl.indexOf(',') + 1)
  return { data, previewUrl, size: sizeLabel(data), width, height }
}

/** Picked file (laptops, or a phone choosing from the camera roll) → scan payload. */
export async function readScanFile(file) {
  if (!file) throw new Error('No file selected')
  if (file.type && !file.type.startsWith('image/')) throw new Error('That file is not an image')

  const { source, width, height, bitmap } = await decode(file)
  try {
    return encodeScan(source, width, height)
  } finally {
    bitmap?.close?.()
  }
}

/**
 * Live <video> frame → scan payload.
 *
 * Captures the FULL frame, not just the region inside the on-screen alignment guide. The
 * guide exists to make the technician hold the sheet square-on; cropping to it would slice
 * off the page border whenever they are slightly out, and that border is exactly what the
 * server's contour detection needs to find and flatten the page.
 */
export function readScanFromVideo(video) {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) throw new Error('The camera has not produced a frame yet')
  return encodeScan(video, width, height)
}
