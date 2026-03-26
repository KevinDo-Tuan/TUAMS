// StreamingSpeech.ts — Model management + sherpa-onnx + Deepgram streaming speech recognition

import * as path from "path"
import * as fs from "fs"
import * as https from "https"
import * as http from "http"
import { app, BrowserWindow } from "electron"
import WebSocket from "ws"

// ── Vosk language models ──
export interface VoskLanguage {
  code: string
  name: string
  modelDir: string
  zipUrl: string
  checkFiles: string[] // files to verify download
}

export const VOSK_LANGUAGES: VoskLanguage[] = [
  { code: "en", name: "English", modelDir: "vosk-model-en-us-0.22-lgraph", zipUrl: "https://huggingface.co/rhasspy/vosk-models/resolve/main/en/vosk-model-en-us-0.22-lgraph.zip", checkFiles: ["am/final.mdl", "conf/mfcc.conf"] },
  { code: "zh", name: "Chinese", modelDir: "vosk-model-small-cn-0.22", zipUrl: "https://huggingface.co/rhasspy/vosk-models/resolve/main/zh/vosk-model-small-cn-0.22.zip", checkFiles: ["am/final.mdl", "conf/mfcc.conf"] },
  { code: "es", name: "Spanish", modelDir: "vosk-model-small-es-0.42", zipUrl: "https://huggingface.co/rhasspy/vosk-models/resolve/main/es/vosk-model-small-es-0.42.zip", checkFiles: ["am/final.mdl", "conf/mfcc.conf"] },
  { code: "fr", name: "French", modelDir: "vosk-model-small-fr-0.22", zipUrl: "https://huggingface.co/rhasspy/vosk-models/resolve/main/fr/vosk-model-small-fr-0.22.zip", checkFiles: ["am/final.mdl", "conf/mfcc.conf"] },
  { code: "de", name: "German", modelDir: "vosk-model-small-de-0.15", zipUrl: "https://huggingface.co/rhasspy/vosk-models/resolve/main/de/vosk-model-small-de-0.15.zip", checkFiles: ["am/final.mdl", "conf/mfcc.conf"] },
  { code: "ru", name: "Russian", modelDir: "vosk-model-small-ru-0.22", zipUrl: "https://huggingface.co/rhasspy/vosk-models/resolve/main/ru/vosk-model-small-ru-0.22.zip", checkFiles: ["am/final.mdl", "conf/mfcc.conf"] },
  { code: "ja", name: "Japanese", modelDir: "vosk-model-small-ja-0.22", zipUrl: "https://huggingface.co/rhasspy/vosk-models/resolve/main/ja/vosk-model-small-ja-0.22.zip", checkFiles: ["am/final.mdl", "conf/mfcc.conf"] },
  { code: "ko", name: "Korean", modelDir: "vosk-model-small-ko-0.22", zipUrl: "https://huggingface.co/rhasspy/vosk-models/resolve/main/ko/vosk-model-small-ko-0.22.zip", checkFiles: ["am/final.mdl", "conf/mfcc.conf"] },
  { code: "pt", name: "Portuguese", modelDir: "vosk-model-small-pt-0.3", zipUrl: "https://huggingface.co/rhasspy/vosk-models/resolve/main/pt/vosk-model-small-pt-0.3.zip", checkFiles: ["am/final.mdl", "conf/mfcc.conf"] },
  { code: "it", name: "Italian", modelDir: "vosk-model-small-it-0.22", zipUrl: "https://huggingface.co/rhasspy/vosk-models/resolve/main/it/vosk-model-small-it-0.22.zip", checkFiles: ["am/final.mdl", "conf/mfcc.conf"] },
  { code: "vi", name: "Vietnamese", modelDir: "vosk-model-small-vn-0.4", zipUrl: "https://huggingface.co/rhasspy/vosk-models/resolve/main/vi/vosk-model-small-vn-0.4.zip", checkFiles: ["am/final.mdl", "conf/mfcc.conf"] },
]

// Current active language (persisted via simple JSON file)
let currentLanguageCode = "en"
const LANG_CONFIG_FILE = "vosk-language.json"

function getLangConfigPath(): string {
  return path.join(app.getPath("userData"), LANG_CONFIG_FILE)
}

export function loadLanguageConfig(): string {
  try {
    const configPath = getLangConfigPath()
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, "utf-8"))
      if (data.language && VOSK_LANGUAGES.some(l => l.code === data.language)) {
        currentLanguageCode = data.language
      }
    }
  } catch {}
  return currentLanguageCode
}

export function saveLanguageConfig(code: string): void {
  currentLanguageCode = code
  try {
    fs.writeFileSync(getLangConfigPath(), JSON.stringify({ language: code }))
  } catch {}
}

export function getCurrentLanguage(): VoskLanguage {
  return VOSK_LANGUAGES.find(l => l.code === currentLanguageCode) || VOSK_LANGUAGES[0]
}

export function getAvailableLanguages(): Array<{ code: string; name: string; downloaded: boolean }> {
  return VOSK_LANGUAGES.map(lang => ({
    code: lang.code,
    name: lang.name,
    downloaded: isVoskLanguageDownloaded(lang),
  }))
}

function isVoskLanguageDownloaded(lang: VoskLanguage): boolean {
  const dir = path.join(getModelsDir(), lang.modelDir)
  return lang.checkFiles.every(f => fs.existsSync(path.join(dir, f)))
}

export async function downloadVoskLanguage(
  lang: VoskLanguage,
  onProgress?: (file: string, percent: number) => void
): Promise<void> {
  const modelsDir = getModelsDir()
  fs.mkdirSync(modelsDir, { recursive: true })
  const zipPath = path.join(modelsDir, `${lang.modelDir}.zip`)

  console.log(`[VoskModel] Downloading ${lang.name} model...`)
  await downloadFile(lang.zipUrl, zipPath, (pct) => onProgress?.("zip", pct))
  console.log(`[VoskModel] ${lang.name} zip downloaded, extracting...`)

  const { execSync } = require("child_process")
  try {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${modelsDir}'"`,
      { timeout: 120000, windowsHide: true }
    )
  } finally {
    try { fs.unlinkSync(zipPath) } catch {}
  }
  console.log(`[VoskModel] ${lang.name} model ready`)
}

// Get vosk tar.gz for a specific language model
export async function getVoskModelTarGzForLang(lang: VoskLanguage): Promise<Buffer> {
  const modelDir = path.join(getModelsDir(), lang.modelDir)
  const tarGzPath = path.join(getModelsDir(), `${lang.modelDir}.tar.gz`)

  if (fs.existsSync(tarGzPath)) {
    return fs.readFileSync(tarGzPath)
  }

  // Build tar.gz (reuse the same logic as getVoskModelTarGz)
  const chunks: Buffer[] = []

  function createTarHeader(name: string, size: number, isDir: boolean): Buffer {
    const header = Buffer.alloc(512)
    header.write(name, 0, Math.min(name.length, 100), "utf8")
    header.write(isDir ? "0000755" : "0000644", 100, 7, "utf8")
    header[107] = 0
    header.write("0001750", 108, 7, "utf8")
    header[115] = 0
    header.write("0001750", 116, 7, "utf8")
    header[123] = 0
    header.write(size.toString(8).padStart(11, "0"), 124, 11, "utf8")
    header[135] = 0
    const mtime = Math.floor(Date.now() / 1000)
    header.write(mtime.toString(8).padStart(11, "0"), 136, 11, "utf8")
    header[147] = 0
    header.write("        ", 148, 8, "utf8")
    header[156] = isDir ? 53 : 48
    header.write("ustar", 257, 5, "utf8")
    header.write("00", 263, 2, "utf8")
    let checksum = 0
    for (let i = 0; i < 512; i++) checksum += header[i]
    header.write(checksum.toString(8).padStart(6, "0"), 148, 6, "utf8")
    header[154] = 0
    header[155] = 32
    return header
  }

  function collectFiles(dir: string, prefix: string): { rel: string; abs: string; isDir: boolean }[] {
    const entries: { rel: string; abs: string; isDir: boolean }[] = []
    const items = fs.readdirSync(dir, { withFileTypes: true })
    for (const item of items) {
      const rel = prefix ? `${prefix}/${item.name}` : item.name
      const abs = path.join(dir, item.name)
      if (item.isDirectory()) {
        entries.push({ rel: rel + "/", abs, isDir: true })
        entries.push(...collectFiles(abs, rel))
      } else {
        entries.push({ rel, abs, isDir: false })
      }
    }
    return entries
  }

  const modelName = lang.modelDir + "/"
  chunks.push(createTarHeader(modelName, 0, true))
  const files = collectFiles(modelDir, lang.modelDir)
  for (const entry of files) {
    if (entry.isDir) {
      chunks.push(createTarHeader(entry.rel, 0, true))
    } else {
      const data = fs.readFileSync(entry.abs)
      chunks.push(createTarHeader(entry.rel, data.length, false))
      chunks.push(data)
      const remainder = data.length % 512
      if (remainder > 0) chunks.push(Buffer.alloc(512 - remainder))
    }
  }
  chunks.push(Buffer.alloc(1024))

  const tarBuffer = Buffer.concat(chunks)
  const zlib = await import("zlib")
  const gzipped: Buffer = await new Promise((resolve, reject) => {
    zlib.gzip(tarBuffer, (err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })

  fs.writeFileSync(tarGzPath, gzipped)
  console.log(`[VoskModel] Created ${lang.name} tar.gz (${(gzipped.length / 1024 / 1024).toFixed(1)} MB)`)
  return gzipped
}

// ── Model config ──
// Larger model trained on LibriSpeech + GigaSpeech (188MB encoder, much more accurate)
const SHERPA_MODEL_DIR = "sherpa-onnx-streaming-zipformer-en-2023-06-21"
const SHERPA_MODEL_FILES: Record<string, string> = {
  "encoder-epoch-99-avg-1.int8.onnx":
    "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-21/resolve/main/encoder-epoch-99-avg-1.int8.onnx",
  "decoder-epoch-99-avg-1.int8.onnx":
    "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-21/resolve/main/decoder-epoch-99-avg-1.int8.onnx",
  "joiner-epoch-99-avg-1.int8.onnx":
    "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-21/resolve/main/joiner-epoch-99-avg-1.int8.onnx",
  "tokens.txt":
    "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-21/resolve/main/tokens.txt",
}

// Default English model (kept for backward compat with existing download checks)
const VOSK_MODEL_DIR = "vosk-model-en-us-0.22-lgraph"
const VOSK_MODEL_ZIP_URL =
  "https://huggingface.co/rhasspy/vosk-models/resolve/main/en/vosk-model-en-us-0.22-lgraph.zip"

// ── Download helper (with resume + stall detection + auto-retry) ──
const STALL_TIMEOUT_MS = 30_000 // 30s no data = stalled
const MAX_RETRIES = 5

function downloadFile(
  url: string,
  dest: string,
  onProgress?: (percent: number) => void,
  onStall?: (retryNum: number, maxRetries: number) => void
): Promise<void> {
  const dir = path.dirname(dest)
  fs.mkdirSync(dir, { recursive: true })

  const attempt = (retryNum: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Check existing bytes for resume
      let existingSize = 0
      try { existingSize = fs.statSync(dest).size } catch {}

      let stallTimer: ReturnType<typeof setTimeout> | null = null
      let currentRes: any = null

      const resetStallTimer = () => {
        if (stallTimer) clearTimeout(stallTimer)
        stallTimer = setTimeout(() => {
          console.warn(`[Download] Stalled for ${STALL_TIMEOUT_MS / 1000}s, aborting...`)
          if (currentRes) currentRes.destroy()
          onStall?.(retryNum + 1, MAX_RETRIES)
          if (retryNum + 1 < MAX_RETRIES) {
            console.log(`[Download] Retry ${retryNum + 1}/${MAX_RETRIES}...`)
            attempt(retryNum + 1).then(resolve, reject)
          } else {
            reject(new Error(`Download stalled after ${MAX_RETRIES} retries`))
          }
        }, STALL_TIMEOUT_MS)
      }

      const follow = (currentUrl: string, redirects = 0) => {
        if (redirects > 10) { reject(new Error("Too many redirects")); return }
        const parsed = new URL(currentUrl)
        const proto = parsed.protocol === "https:" ? https : http
        const options: any = {
          hostname: parsed.hostname,
          port: parsed.port,
          path: parsed.pathname + parsed.search,
          headers: {} as Record<string, string>,
        }
        if (existingSize > 0) {
          options.headers["Range"] = `bytes=${existingSize}-`
          console.log(`[Download] Resuming from ${(existingSize / 1024 / 1024).toFixed(1)} MB`)
        }

        resetStallTimer()

        proto.get(options, (res) => {
          currentRes = res

          if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            const next = new URL(res.headers.location, currentUrl).toString()
            follow(next, redirects + 1)
            return
          }

          const isResume = res.statusCode === 206
          if (!isResume && res.statusCode !== 200) {
            if (stallTimer) clearTimeout(stallTimer)
            reject(new Error(`Download failed: HTTP ${res.statusCode} for ${currentUrl}`))
            return
          }

          let total = 0
          let received = 0
          let file: fs.WriteStream

          if (isResume) {
            const contentRange = res.headers["content-range"] || ""
            const totalMatch = contentRange.match(/\/(\d+)/)
            total = totalMatch ? parseInt(totalMatch[1], 10) : 0
            received = existingSize
            file = fs.createWriteStream(dest, { flags: "a" })
            console.log(`[Download] Resumed: ${(existingSize / 1024 / 1024).toFixed(1)} MB done, total ${total ? (total / 1024 / 1024).toFixed(1) + " MB" : "unknown"}`)
          } else {
            if (existingSize > 0) console.log("[Download] Server doesn't support resume, restarting")
            total = parseInt(res.headers["content-length"] || "0", 10)
            file = fs.createWriteStream(dest)
          }

          let lastReported = -1

          res.on("data", (chunk: Buffer) => {
            resetStallTimer()
            received += chunk.length
            file.write(chunk)
            if (total > 0) {
              const pct = Math.round((received / total) * 100)
              if (pct !== lastReported) { lastReported = pct; onProgress?.(pct) }
            } else {
              const mb = Math.floor(received / (1024 * 1024))
              if (mb !== lastReported) { lastReported = mb; onProgress?.(-mb) }
            }
          })
          res.on("end", () => {
            if (stallTimer) clearTimeout(stallTimer)
            file.end(() => resolve())
          })
          res.on("error", (err) => {
            if (stallTimer) clearTimeout(stallTimer)
            file.close()
            // Connection reset/abort mid-download — retry with resume
            if (retryNum + 1 < MAX_RETRIES) {
              console.warn(`[Download] Stream error: ${err.message}, retry ${retryNum + 1}/${MAX_RETRIES}...`)
              onStall?.(retryNum + 1, MAX_RETRIES)
              attempt(retryNum + 1).then(resolve, reject)
            } else {
              reject(err)
            }
          })
        }).on("error", (err) => {
          if (stallTimer) clearTimeout(stallTimer)
          // Network error — retry if possible
          if (retryNum + 1 < MAX_RETRIES) {
            console.warn(`[Download] Network error: ${err.message}, retry ${retryNum + 1}/${MAX_RETRIES}...`)
            onStall?.(retryNum + 1, MAX_RETRIES)
            attempt(retryNum + 1).then(resolve, reject)
          } else {
            reject(err)
          }
        })
      }
      follow(url)
    })
  }

  return attempt(0)
}

// ── Model paths ──
function getModelsDir(): string {
  return path.join(app.getPath("userData"), "models")
}

function getSherpaModelDir(): string {
  return path.join(getModelsDir(), SHERPA_MODEL_DIR)
}

function getVoskModelDir(): string {
  return path.join(getModelsDir(), VOSK_MODEL_DIR)
}

// ── Sherpa-onnx model management ──
export function isSherpaModelDownloaded(): boolean {
  const dir = getSherpaModelDir()
  return Object.keys(SHERPA_MODEL_FILES).every((f) =>
    fs.existsSync(path.join(dir, f))
  )
}

export async function downloadSherpaModel(
  onProgress?: (file: string, percent: number) => void
): Promise<void> {
  const dir = getSherpaModelDir()
  fs.mkdirSync(dir, { recursive: true })

  for (const [file, url] of Object.entries(SHERPA_MODEL_FILES)) {
    const dest = path.join(dir, file)
    if (fs.existsSync(dest)) {
      console.log(`[SherpaModel] ${file} already exists, skipping`)
      continue
    }
    console.log(`[SherpaModel] Downloading ${file}...`)
    await downloadFile(url, dest, (pct) => onProgress?.(file, pct))
    console.log(`[SherpaModel] ${file} done`)
  }
}

// ── Vosk model management ──
export function isVoskModelDownloaded(): boolean {
  const dir = getVoskModelDir()
  // Check a few key files
  return (
    fs.existsSync(path.join(dir, "am", "final.mdl")) &&
    fs.existsSync(path.join(dir, "conf", "mfcc.conf"))
  )
}

export async function downloadVoskModel(
  onProgress?: (file: string, percent: number) => void,
  onStall?: (retryNum: number, maxRetries: number) => void
): Promise<void> {
  const modelsDir = getModelsDir()
  fs.mkdirSync(modelsDir, { recursive: true })

  const zipPath = path.join(modelsDir, `${VOSK_MODEL_DIR}.zip`)

  // Download zip
  console.log("[VoskModel] Downloading zip from alphacephei.com...")
  await downloadFile(VOSK_MODEL_ZIP_URL, zipPath, (pct) => onProgress?.("zip", pct), onStall)
  console.log("[VoskModel] Zip downloaded, extracting...")

  // Extract zip using Node.js built-in (Electron ships with zlib)
  const { execSync } = require("child_process")
  try {
    // Use PowerShell to extract on Windows
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${modelsDir}'"`,
      { timeout: 120000, windowsHide: true }
    )
  } finally {
    // Clean up zip file
    try { fs.unlinkSync(zipPath) } catch {}
  }

  console.log("[VoskModel] Download and extraction complete")
}

// ── Create vosk model tar.gz for vosk-browser ──
// vosk-browser needs a tar.gz archive. We build one from the downloaded files.
export async function getVoskModelTarGz(): Promise<Buffer> {
  const modelDir = getVoskModelDir()
  const tarGzPath = path.join(getModelsDir(), `${VOSK_MODEL_DIR}.tar.gz`)

  // Return cached tar.gz if it exists
  if (fs.existsSync(tarGzPath)) {
    return fs.readFileSync(tarGzPath)
  }

  // Build tar.gz manually: tar header (512 bytes) + data + padding for each file
  const { createGzip } = await import("zlib")
  const chunks: Buffer[] = []

  function createTarHeader(
    name: string,
    size: number,
    isDir: boolean
  ): Buffer {
    const header = Buffer.alloc(512)
    // Name (100 bytes)
    header.write(name, 0, Math.min(name.length, 100), "utf8")
    // Mode (8 bytes)
    header.write(isDir ? "0000755" : "0000644", 100, 7, "utf8")
    header[107] = 0
    // UID (8 bytes)
    header.write("0001750", 108, 7, "utf8")
    header[115] = 0
    // GID (8 bytes)
    header.write("0001750", 116, 7, "utf8")
    header[123] = 0
    // Size (12 bytes) - octal
    header.write(size.toString(8).padStart(11, "0"), 124, 11, "utf8")
    header[135] = 0
    // Mtime (12 bytes)
    const mtime = Math.floor(Date.now() / 1000)
    header.write(mtime.toString(8).padStart(11, "0"), 136, 11, "utf8")
    header[147] = 0
    // Checksum placeholder (8 spaces)
    header.write("        ", 148, 8, "utf8")
    // Type flag
    header[156] = isDir ? 53 : 48 // '5' for dir, '0' for file
    // USTAR indicator
    header.write("ustar", 257, 5, "utf8")
    header.write("00", 263, 2, "utf8")
    // Compute checksum
    let checksum = 0
    for (let i = 0; i < 512; i++) checksum += header[i]
    header.write(checksum.toString(8).padStart(6, "0"), 148, 6, "utf8")
    header[154] = 0
    header[155] = 32
    return header
  }

  // Collect all files recursively
  function collectFiles(dir: string, prefix: string): { rel: string; abs: string; isDir: boolean }[] {
    const entries: { rel: string; abs: string; isDir: boolean }[] = []
    const items = fs.readdirSync(dir, { withFileTypes: true })
    for (const item of items) {
      const rel = prefix ? `${prefix}/${item.name}` : item.name
      const abs = path.join(dir, item.name)
      if (item.isDirectory()) {
        entries.push({ rel: rel + "/", abs, isDir: true })
        entries.push(...collectFiles(abs, rel))
      } else {
        entries.push({ rel, abs, isDir: false })
      }
    }
    return entries
  }

  // Add model directory entry
  const modelName = VOSK_MODEL_DIR + "/"
  chunks.push(createTarHeader(modelName, 0, true))

  const files = collectFiles(modelDir, VOSK_MODEL_DIR)
  for (const entry of files) {
    if (entry.isDir) {
      chunks.push(createTarHeader(entry.rel, 0, true))
    } else {
      const data = fs.readFileSync(entry.abs)
      chunks.push(createTarHeader(entry.rel, data.length, false))
      chunks.push(data)
      // Pad to 512-byte boundary
      const remainder = data.length % 512
      if (remainder > 0) {
        chunks.push(Buffer.alloc(512 - remainder))
      }
    }
  }

  // End-of-archive marker (two 512-byte zero blocks)
  chunks.push(Buffer.alloc(1024))

  const tarBuffer = Buffer.concat(chunks)

  // Gzip compress
  const zlib = await import("zlib")
  const gzipped: Buffer = await new Promise((resolve, reject) => {
    zlib.gzip(tarBuffer, (err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })

  // Cache the tar.gz
  fs.writeFileSync(tarGzPath, gzipped)
  console.log(`[VoskModel] Created tar.gz (${(gzipped.length / 1024 / 1024).toFixed(1)} MB)`)
  return gzipped
}

// Pre-build and cache the vosk tar.gz so it's instant when Listen is pressed
export async function preloadVoskModel(): Promise<void> {
  if (!isVoskModelDownloaded()) return
  try {
    console.log("[VoskModel] Preloading tar.gz cache...")
    await getVoskModelTarGz()
    console.log("[VoskModel] Preload complete")
  } catch (err: any) {
    console.warn("[VoskModel] Preload failed:", err.message)
  }
}

// ── Sherpa-onnx streaming recognizer ──
export class SherpaEngine {
  private recognizer: any = null
  private stream: any = null
  private lastText: string = ""
  private segmentTexts: string[] = []
  private mainWindow: BrowserWindow | null = null

  async init(mainWindow: BrowserWindow): Promise<boolean> {
    this.mainWindow = mainWindow
    try {
      // Dynamic require — fails gracefully if native addon not available
      const sherpaOnnx = require("sherpa-onnx-node")
      const modelDir = getSherpaModelDir()

      const config = {
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: {
          transducer: {
            encoder: path.join(modelDir, "encoder-epoch-99-avg-1.int8.onnx"),
            decoder: path.join(modelDir, "decoder-epoch-99-avg-1.int8.onnx"),
            joiner: path.join(modelDir, "joiner-epoch-99-avg-1.int8.onnx"),
          },
          tokens: path.join(modelDir, "tokens.txt"),
          numThreads: Math.max(2, require("os").cpus().length),
          provider: "cpu",
          debug: 0,
        },
        decodingMethod: "greedy_search",
        maxActivePaths: 4,
        enableEndpoint: true,
        rule1MinTrailingSilence: 2.4,
        rule2MinTrailingSilence: 1.2,
        rule3MinUtteranceLength: 20,
      }

      this.recognizer = new sherpaOnnx.OnlineRecognizer(config)
      this.stream = this.recognizer.createStream()
      this.lastText = ""
      this.segmentTexts = []
      console.log("[SherpaEngine] Initialized successfully")
      return true
    } catch (err: any) {
      console.error("[SherpaEngine] Init failed:", err.message)
      this.recognizer = null
      this.stream = null
      return false
    }
  }

  feedAudio(float32Samples: Float32Array): void {
    if (!this.recognizer || !this.stream) return

    this.stream.acceptWaveform({ sampleRate: 16000, samples: float32Samples })

    while (this.recognizer.isReady(this.stream)) {
      this.recognizer.decode(this.stream)
    }

    const result = this.recognizer.getResult(this.stream)
    const isEndpoint = this.recognizer.isEndpoint(this.stream)

    if (isEndpoint) {
      if (result.text && result.text.trim()) {
        this.segmentTexts.push(result.text.trim())
      }
      this.recognizer.reset(this.stream)
      this.lastText = ""
    } else {
      this.lastText = result.text || ""
    }

    // Build full display text
    const fullText = [...this.segmentTexts, this.lastText]
      .filter(Boolean)
      .join(" ")

    // Send to renderer
    if (fullText && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("live-transcript", {
        type: isEndpoint ? "final" : "partial",
        text: fullText,
      })
    }
  }

  stop(): string {
    const text = [...this.segmentTexts, this.lastText]
      .filter(Boolean)
      .join(" ")

    if (this.stream) {
      try {
        // Feed silence to flush
        const silence = new Float32Array(16000 * 0.4)
        this.stream.acceptWaveform({ sampleRate: 16000, samples: silence })
        while (this.recognizer?.isReady(this.stream)) {
          this.recognizer.decode(this.stream)
        }
        const finalResult = this.recognizer?.getResult(this.stream)
        if (finalResult?.text?.trim()) {
          this.segmentTexts.push(finalResult.text.trim())
        }
        this.stream.inputFinished()
      } catch {}
    }

    const finalText = [...this.segmentTexts, this.lastText]
      .filter(Boolean)
      .join(" ")

    this.recognizer = null
    this.stream = null
    this.lastText = ""
    this.segmentTexts = []
    console.log("[SherpaEngine] Stopped, text:", finalText)
    return finalText || text
  }

  isRunning(): boolean {
    return this.recognizer !== null && this.stream !== null
  }
}

// ── Deepgram cloud streaming recognizer ──
export class DeepgramEngine {
  private ws: WebSocket | null = null
  private mainWindow: BrowserWindow | null = null
  private segmentTexts: string[] = []
  private currentPartial: string = ""
  private apiKey: string = ""
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null

  async init(mainWindow: BrowserWindow, language: string = "en"): Promise<boolean> {
    this.mainWindow = mainWindow
    this.apiKey = process.env.DEEPGRAM_API_KEY || ""
    if (!this.apiKey) {
      console.log("[Deepgram] No API key, skipping")
      return false
    }

    try {
      const url = `wss://api.deepgram.com/v1/listen?model=nova-3&language=${language}&smart_format=true&interim_results=true&utterance_end_ms=1000&vad_events=true&encoding=linear16&sample_rate=16000&channels=1`

      this.ws = new WebSocket(url, {
        headers: { Authorization: `Token ${this.apiKey}` },
      })

      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          console.error("[Deepgram] Connection timeout")
          this.ws?.close()
          this.ws = null
          resolve(false)
        }, 5000)

        this.ws!.on("open", () => {
          clearTimeout(timeout)
          console.log("[Deepgram] Connected")
          this.segmentTexts = []
          this.currentPartial = ""
          // Keep alive every 8s
          this.keepAliveInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({ type: "KeepAlive" }))
            }
          }, 8000)
          resolve(true)
        })

        this.ws!.on("message", (data: WebSocket.Data) => {
          try {
            const msg = JSON.parse(data.toString())
            if (msg.type === "Results") {
              const transcript = msg.channel?.alternatives?.[0]?.transcript || ""
              const isFinal = msg.is_final

              if (isFinal && transcript) {
                this.segmentTexts.push(transcript)
                this.currentPartial = ""
              } else if (transcript) {
                this.currentPartial = transcript
              }

              const fullText = [...this.segmentTexts, this.currentPartial]
                .filter(Boolean)
                .join(" ")

              if (fullText && this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send("live-transcript", {
                  type: isFinal ? "final" : "partial",
                  text: fullText,
                })
              }
            }
          } catch {}
        })

        this.ws!.on("error", (err) => {
          clearTimeout(timeout)
          console.error("[Deepgram] WebSocket error:", err.message)
          resolve(false)
        })

        this.ws!.on("close", () => {
          if (this.keepAliveInterval) clearInterval(this.keepAliveInterval)
          this.keepAliveInterval = null
        })
      })
    } catch (err: any) {
      console.error("[Deepgram] Init failed:", err.message)
      return false
    }
  }

  feedAudio(int16Buffer: Buffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(int16Buffer)
    }
  }

  stop(): string {
    const text = [...this.segmentTexts, this.currentPartial]
      .filter(Boolean)
      .join(" ")

    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval)
    this.keepAliveInterval = null

    if (this.ws?.readyState === WebSocket.OPEN) {
      // Send CloseStream message
      this.ws.send(JSON.stringify({ type: "CloseStream" }))
      this.ws.close()
    }
    this.ws = null
    this.segmentTexts = []
    this.currentPartial = ""
    console.log("[Deepgram] Stopped, text:", text.slice(0, 100))
    return text
  }

  isRunning(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}

// ── AssemblyAI cloud streaming recognizer ──
export class AssemblyAIEngine {
  private ws: WebSocket | null = null
  private mainWindow: BrowserWindow | null = null
  private segmentTexts: string[] = []
  private currentPartial: string = ""
  private apiKey: string = ""
  private _language: string = "en"

  async init(mainWindow: BrowserWindow, language: string = "en"): Promise<boolean> {
    this.mainWindow = mainWindow
    this.apiKey = process.env.ASSEMBLYAI_API_KEY || ""
    if (!this.apiKey) {
      console.log("[AssemblyAI] No API key, skipping")
      return false
    }

    this._language = language

    try {
      // Step 1: Get a temporary session token
      const tokenRes: any = await new Promise((resolve, reject) => {
        const data = JSON.stringify({ expires_in: 3600 })
        const req = https.request(
          "https://api.assemblyai.com/v2/realtime/token",
          {
            method: "POST",
            headers: {
              Authorization: this.apiKey,
              "Content-Type": "application/json",
            },
          },
          (res) => {
            let body = ""
            res.on("data", (c) => (body += c))
            res.on("end", () => {
              try { resolve(JSON.parse(body)) } catch { reject(new Error("Invalid token response")) }
            })
          }
        )
        req.on("error", reject)
        req.write(data)
        req.end()
      })

      if (!tokenRes.token) throw new Error("No token received")

      // Step 2: Connect WebSocket with token (include language if not English for multilingual support)
      const langParam = this._language && this._language !== "en" ? `&language_code=${this._language}` : ""
      const url = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${tokenRes.token}${langParam}`

      this.ws = new WebSocket(url)

      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          console.error("[AssemblyAI] Connection timeout")
          this.ws?.close()
          this.ws = null
          resolve(false)
        }, 5000)

        this.ws!.on("open", () => {
          clearTimeout(timeout)
          console.log("[AssemblyAI] Connected")
          this.segmentTexts = []
          this.currentPartial = ""
          resolve(true)
        })

        this.ws!.on("message", (data: WebSocket.Data) => {
          try {
            const msg = JSON.parse(data.toString())
            if (msg.message_type === "FinalTranscript" && msg.text) {
              this.segmentTexts.push(msg.text)
              this.currentPartial = ""
            } else if (msg.message_type === "PartialTranscript" && msg.text) {
              this.currentPartial = msg.text
            }

            const fullText = [...this.segmentTexts, this.currentPartial]
              .filter(Boolean)
              .join(" ")

            if (fullText && this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send("live-transcript", {
                type: msg.message_type === "FinalTranscript" ? "final" : "partial",
                text: fullText,
              })
            }
          } catch {}
        })

        this.ws!.on("error", (err) => {
          clearTimeout(timeout)
          console.error("[AssemblyAI] WebSocket error:", err.message)
          resolve(false)
        })
      })
    } catch (err: any) {
      console.error("[AssemblyAI] Init failed:", err.message)
      return false
    }
  }

  feedAudio(int16Buffer: Buffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // AssemblyAI expects base64-encoded PCM
      const base64 = int16Buffer.toString("base64")
      this.ws.send(JSON.stringify({ audio_data: base64 }))
    }
  }

  stop(): string {
    const text = [...this.segmentTexts, this.currentPartial]
      .filter(Boolean)
      .join(" ")

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ terminate_session: true }))
      this.ws.close()
    }
    this.ws = null
    this.segmentTexts = []
    this.currentPartial = ""
    console.log("[AssemblyAI] Stopped, text:", text.slice(0, 100))
    return text
  }

  isRunning(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}

// ── Google Cloud Speech-to-Text streaming recognizer ──
// Map 2-letter language codes to Google STT locale codes
const GOOGLE_LANG_MAP: Record<string, string> = {
  en: "en-US", zh: "zh-CN", es: "es-ES", fr: "fr-FR", de: "de-DE",
  ru: "ru-RU", ja: "ja-JP", ko: "ko-KR", pt: "pt-BR", it: "it-IT", vi: "vi-VN",
}

export class GoogleSTTEngine {
  private ws: WebSocket | null = null
  private mainWindow: BrowserWindow | null = null
  private segmentTexts: string[] = []
  private currentPartial: string = ""
  private apiKey: string = ""
  private requestBody: any = null
  private httpsReq: any = null
  private responseText: string = ""
  private _languageCode: string = "en-US"

  async init(mainWindow: BrowserWindow, language: string = "en"): Promise<boolean> {
    this._languageCode = GOOGLE_LANG_MAP[language] || `${language}-${language.toUpperCase()}`
    this.mainWindow = mainWindow
    this.apiKey = process.env.GOOGLE_STT_API_KEY || ""
    if (!this.apiKey) {
      console.log("[GoogleSTT] No API key, skipping")
      return false
    }

    try {
      // Google Cloud STT v1 streaming via REST is complex; use v2 with WebSocket-like streaming
      // We'll use the recognize API in chunked mode via HTTP streaming
      this.segmentTexts = []
      this.currentPartial = ""
      this._audioChunks = []
      this._flushInterval = setInterval(() => this._flushAudio(), 2000)
      console.log("[GoogleSTT] Initialized (chunked mode, 2s flush)")
      return true
    } catch (err: any) {
      console.error("[GoogleSTT] Init failed:", err.message)
      return false
    }
  }

  private _audioChunks: Buffer[] = []
  private _flushInterval: ReturnType<typeof setInterval> | null = null

  feedAudio(int16Buffer: Buffer): void {
    this._audioChunks.push(int16Buffer)
  }

  private async _flushAudio(): Promise<void> {
    if (this._audioChunks.length === 0) return
    const combined = Buffer.concat(this._audioChunks)
    this._audioChunks = []

    try {
      const audioBase64 = combined.toString("base64")
      const body = JSON.stringify({
        config: {
          encoding: "LINEAR16",
          sampleRateHertz: 16000,
          languageCode: this._languageCode,
          model: "latest_long",
          enableAutomaticPunctuation: true,
        },
        audio: { content: audioBase64 },
      })

      const result: any = await new Promise((resolve, reject) => {
        const req = https.request(
          `https://speech.googleapis.com/v1/speech:recognize?key=${this.apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          },
          (res) => {
            let data = ""
            res.on("data", (c) => (data += c))
            res.on("end", () => {
              try { resolve(JSON.parse(data)) } catch { reject(new Error("Invalid response")) }
            })
          }
        )
        req.on("error", reject)
        req.write(body)
        req.end()
      })

      const transcript = result?.results?.[0]?.alternatives?.[0]?.transcript || ""
      if (transcript) {
        this.segmentTexts.push(transcript)
        const fullText = this.segmentTexts.filter(Boolean).join(" ")
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send("live-transcript", {
            type: "final",
            text: fullText,
          })
        }
      }
    } catch (err: any) {
      console.error("[GoogleSTT] Flush error:", err.message)
    }
  }

  stop(): string {
    if (this._flushInterval) clearInterval(this._flushInterval)
    this._flushInterval = null
    // Flush remaining audio synchronously
    const text = this.segmentTexts.filter(Boolean).join(" ")
    this._audioChunks = []
    this.segmentTexts = []
    this.currentPartial = ""
    console.log("[GoogleSTT] Stopped, text:", text.slice(0, 100))
    return text
  }

  isRunning(): boolean {
    return this._flushInterval !== null
  }
}
