// StreamingSpeech.ts — Model management + sherpa-onnx streaming speech recognition engine

import * as path from "path"
import * as fs from "fs"
import * as https from "https"
import * as http from "http"
import { app, BrowserWindow } from "electron"

// ── Model config ──
const SHERPA_MODEL_DIR = "sherpa-onnx-streaming-zipformer-en-20M-2023-02-17"
const SHERPA_MODEL_FILES: Record<string, string> = {
  "encoder-epoch-99-avg-1.int8.onnx":
    "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17/resolve/main/encoder-epoch-99-avg-1.int8.onnx",
  "decoder-epoch-99-avg-1.int8.onnx":
    "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17/resolve/main/decoder-epoch-99-avg-1.int8.onnx",
  "joiner-epoch-99-avg-1.int8.onnx":
    "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17/resolve/main/joiner-epoch-99-avg-1.int8.onnx",
  "tokens.txt":
    "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17/resolve/main/tokens.txt",
}

const VOSK_MODEL_DIR = "vosk-model-small-en-us-0.15"
const VOSK_MODEL_ZIP_URL =
  "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"

// ── Download helper ──
function downloadFile(
  url: string,
  dest: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl: string, redirects = 0) => {
      if (redirects > 10) {
        reject(new Error("Too many redirects"))
        return
      }
      const parsed = new URL(currentUrl)
      const proto = parsed.protocol === "https:" ? https : http
      proto
        .get(currentUrl, (res) => {
          if (
            res.statusCode &&
            [301, 302, 303, 307, 308].includes(res.statusCode) &&
            res.headers.location
          ) {
            // Resolve relative redirect URLs against the current URL
            const next = new URL(res.headers.location, currentUrl).toString()
            follow(next, redirects + 1)
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Download failed: HTTP ${res.statusCode} for ${currentUrl}`))
            return
          }
          const total = parseInt(res.headers["content-length"] || "0", 10)
          let received = 0
          const dir = path.dirname(dest)
          fs.mkdirSync(dir, { recursive: true })
          const file = fs.createWriteStream(dest)
          res.on("data", (chunk: Buffer) => {
            received += chunk.length
            file.write(chunk)
            if (total > 0) onProgress?.(Math.round((received / total) * 100))
          })
          res.on("end", () => {
            file.end(() => resolve())
          })
          res.on("error", (err) => {
            file.close()
            reject(err)
          })
        })
        .on("error", reject)
    }
    follow(url)
  })
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
  onProgress?: (file: string, percent: number) => void
): Promise<void> {
  const modelsDir = getModelsDir()
  fs.mkdirSync(modelsDir, { recursive: true })

  const zipPath = path.join(modelsDir, `${VOSK_MODEL_DIR}.zip`)

  // Download zip
  console.log("[VoskModel] Downloading zip from alphacephei.com...")
  await downloadFile(VOSK_MODEL_ZIP_URL, zipPath, (pct) => onProgress?.("zip", pct))
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
          numThreads: 2,
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
