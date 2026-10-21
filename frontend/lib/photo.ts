// Browser-side photo preparation (plan: NFR07 and Phase 3).
// 1. Optional on-device face blur with MediaPipe Face Detector, loaded from this app's own origin.
// 2. Compression to about 1,600 px on the long edge before upload, to save data.

const MAX_EDGE = 1600
export const FACE_MODEL_PATH = '/models/blaze_face_short_range.tflite'

export async function loadImage(file: File): Promise<ImageBitmap> {
  return await createImageBitmap(file, { imageOrientation: 'from-image' })
}

function drawScaled(img: ImageBitmap): HTMLCanvasElement {
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available in this browser')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

export async function faceBlurAvailable(): Promise<boolean> {
  try {
    const res = await fetch(FACE_MODEL_PATH, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

type Box = { originX: number; originY: number; width: number; height: number }

async function detectFaces(canvas: HTMLCanvasElement): Promise<Box[]> {
  const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
  const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
  const detector = await FaceDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: FACE_MODEL_PATH },
    runningMode: 'IMAGE',
  })
  try {
    const result = detector.detect(canvas)
    const boxes: Box[] = []
    for (const d of result.detections) {
      const b = d.boundingBox
      if (b) boxes.push({ originX: b.originX, originY: b.originY, width: b.width, height: b.height })
    }
    return boxes
  } finally {
    detector.close()
  }
}

function blurBoxes(canvas: HTMLCanvasElement, boxes: Box[]): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  for (const b of boxes) {
    // Pad the box so eyes and mouth are fully covered, then pixelate heavily.
    const pad = 0.2
    const x = Math.max(0, Math.floor(b.originX - b.width * pad))
    const y = Math.max(0, Math.floor(b.originY - b.height * pad))
    const w = Math.min(canvas.width - x, Math.ceil(b.width * (1 + 2 * pad)))
    const h = Math.min(canvas.height - y, Math.ceil(b.height * (1 + 2 * pad)))
    const tiny = document.createElement('canvas')
    tiny.width = Math.max(1, Math.round(w / 24))
    tiny.height = Math.max(1, Math.round(h / 24))
    tiny.getContext('2d')?.drawImage(canvas, x, y, w, h, 0, 0, tiny.width, tiny.height)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, x, y, w, h)
    ctx.imageSmoothingEnabled = true
  }
}

export type Prepared = { blob: Blob; previewUrl: string; facesBlurred: number; width: number; height: number }

export async function preparePhoto(file: File, blurFaces: boolean): Promise<Prepared> {
  const img = await loadImage(file)
  const canvas = drawScaled(img)
  img.close()
  let facesBlurred = 0
  if (blurFaces) {
    const boxes = await detectFaces(canvas)
    blurBoxes(canvas, boxes)
    facesBlurred = boxes.length
  }
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not compress the photo'))), 'image/jpeg', 0.85),
  )
  return { blob, previewUrl: URL.createObjectURL(blob), facesBlurred, width: canvas.width, height: canvas.height }
}
