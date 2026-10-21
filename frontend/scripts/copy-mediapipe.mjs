// Copies MediaPipe's WebAssembly files into public/ so on-device face blur loads them from this
// app's own origin (no CDN). Runs automatically after `npm install`.
import { cpSync, existsSync, mkdirSync } from 'node:fs'

const from = 'node_modules/@mediapipe/tasks-vision/wasm'
const to = 'public/mediapipe/wasm'
if (existsSync(from)) {
  mkdirSync(to, { recursive: true })
  cpSync(from, to, { recursive: true })
  console.log(`Copied MediaPipe wasm to ${to}`)
} else {
  console.warn('MediaPipe not installed yet; skipping wasm copy')
}
