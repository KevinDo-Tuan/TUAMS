// ipcHandlers.ts

import { ipcMain, app, desktopCapturer, dialog } from "electron"
import { AppState } from "./main"
import { execFile, spawn, ChildProcess } from "child_process"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import * as https from "https"
import {
  SherpaEngine,
  DeepgramEngine,
  AssemblyAIEngine,
  GoogleSTTEngine,
  isSherpaModelDownloaded,
  downloadSherpaModel,
  isVoskModelDownloaded,
  downloadVoskModel,
  getVoskModelTarGz,
  getAvailableLanguages,
  getCurrentLanguage,
  saveLanguageConfig,
  downloadVoskLanguage,
  getVoskModelTarGzForLang,
  VOSK_LANGUAGES,
} from "./StreamingSpeech"

export function initializeIpcHandlers(appState: AppState): void {
  // Cleanup leftover recording frames from crashed sessions
  const recordingFramesDir = path.join(app.getPath("userData"), "recording_frames")
  try {
    if (fs.existsSync(recordingFramesDir)) {
      fs.rmSync(recordingFramesDir, { recursive: true, force: true })
    }
    fs.mkdirSync(recordingFramesDir, { recursive: true })
  } catch (e) {
    console.error("[RecordingFrames] Startup cleanup error:", e)
  }

  // Save a single recording frame to disk
  ipcMain.handle(
    "save-recording-frame",
    async (_event, sessionId: string, base64: string, index: number) => {
      try {
        const sessionDir = path.join(recordingFramesDir, sessionId)
        fs.mkdirSync(sessionDir, { recursive: true })
        const fileName = `frame_${String(index).padStart(6, "0")}.jpg`
        const filePath = path.join(sessionDir, fileName)
        await fs.promises.writeFile(filePath, Buffer.from(base64, "base64"))
        return { success: true }
      } catch (err: any) {
        console.error("[RecordingFrames] Save error:", err)
        return { success: false, error: err.message }
      }
    }
  )

  // Sample N evenly-spaced frames from a recording session, return as base64
  ipcMain.handle(
    "sample-recording-frames",
    async (_event, sessionId: string, count: number) => {
      try {
        const sessionDir = path.join(recordingFramesDir, sessionId)
        if (!fs.existsSync(sessionDir)) return []
        const files = fs.readdirSync(sessionDir)
          .filter((f: string) => f.startsWith("frame_") && f.endsWith(".jpg"))
          .sort()
        const total = files.length
        if (total === 0) return []
        if (total <= count) {
          return await Promise.all(
            files.map((f: string) =>
              fs.promises.readFile(path.join(sessionDir, f)).then((buf: Buffer) => buf.toString("base64"))
            )
          )
        }
        // Pick evenly-spaced indices, always include first and last
        const indices: number[] = [0]
        for (let i = 1; i < count - 1; i++) {
          indices.push(Math.round((i * (total - 1)) / (count - 1)))
        }
        indices.push(total - 1)
        // Deduplicate
        const unique = [...new Set(indices)]
        return await Promise.all(
          unique.map((idx: number) =>
            fs.promises.readFile(path.join(sessionDir, files[idx])).then((buf: Buffer) => buf.toString("base64"))
          )
        )
      } catch (err: any) {
        console.error("[RecordingFrames] Sample error:", err)
        return []
      }
    }
  )

  // Cleanup recording frames for a session
  ipcMain.handle(
    "cleanup-recording-frames",
    async (_event, sessionId: string) => {
      try {
        const sessionDir = path.join(recordingFramesDir, sessionId)
        if (fs.existsSync(sessionDir)) {
          fs.rmSync(sessionDir, { recursive: true, force: true })
        }
      } catch (err) {
        console.error("[RecordingFrames] Cleanup error:", err)
      }
    }
  )

  ipcMain.handle(
    "update-content-dimensions",
    async (event, { width, height }: { width: number; height: number }) => {
      if (width && height) {
        appState.setWindowDimensions(width, height)
      }
    }
  )

  ipcMain.handle("get-window-bounds", async () => {
    const win = appState.getMainWindow()
    if (!win || win.isDestroyed()) return null
    return win.getBounds()
  })

  ipcMain.handle(
    "set-window-bounds",
    async (event, bounds: { x: number; y: number; width: number; height: number }) => {
      const win = appState.getMainWindow()
      if (!win || win.isDestroyed()) return
      win.setBounds(bounds)
    }
  )

  ipcMain.handle("delete-screenshot", async (event, path: string) => {
    return appState.deleteScreenshot(path)
  })

  ipcMain.handle("take-screenshot", async () => {
    try {
      const screenshotPath = await appState.takeScreenshot()
      const preview = await appState.getImagePreview(screenshotPath)
      return { path: screenshotPath, preview }
    } catch (error) {
      console.error("Error taking screenshot:", error)
      throw error
    }
  })

  ipcMain.handle("get-screenshots", async () => {
    console.log({ view: appState.getView() })
    try {
      let previews = []
      if (appState.getView() === "queue") {
        previews = await Promise.all(
          appState.getScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      } else {
        previews = await Promise.all(
          appState.getExtraScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      }
      previews.forEach((preview: any) => console.log(preview.path))
      return previews
    } catch (error) {
      console.error("Error getting screenshots:", error)
      throw error
    }
  })

  ipcMain.handle("toggle-window", async () => {
    appState.toggleMainWindow()
  })

  ipcMain.handle("reset-queues", async () => {
    try {
      appState.clearQueues()
      console.log("Screenshot queues have been cleared.")
      return { success: true }
    } catch (error: any) {
      console.error("Error resetting queues:", error)
      return { success: false, error: error.message }
    }
  })

  // IPC handler for analyzing audio from base64 data
  ipcMain.handle("analyze-audio-base64", async (event, data: string, mimeType: string) => {
    try {
      const result = await appState.processingHelper.processAudioBase64(data, mimeType)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-base64 handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing audio from file path
  ipcMain.handle("analyze-audio-file", async (event, path: string) => {
    try {
      const result = await appState.processingHelper.processAudioFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-file handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing image from file path
  ipcMain.handle("analyze-image-file", async (event, path: string) => {
    try {
      const result = await appState.processingHelper.getLLMHelper().analyzeImageFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-image-file handler:", error)
      throw error
    }
  })

  ipcMain.handle("ai-chat", async (event, message: string) => {
    try {
      const result = await appState.processingHelper.getLLMHelper().chat(message);
      return result;
    } catch (error: any) {
      console.error("Error in ai-chat handler:", error);
      throw error;
    }
  });

  ipcMain.handle("ai-chat-stream", async (event, message: string) => {
    try {
      const mainWindow = appState.getMainWindow()
      const result = await appState.processingHelper.getLLMHelper().chatStream(message, (accumulated) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("ai-stream-token", accumulated)
        }
      })
      return result
    } catch (error: any) {
      console.error("Error in ai-chat-stream handler:", error)
      throw error
    }
  })

  ipcMain.handle("ai-chat-vision", async (event, message: string, images: string[]) => {
    try {
      const result = await appState.processingHelper.getLLMHelper().chatWithVision(message, images);
      return result;
    } catch (error: any) {
      console.error("Error in ai-chat-vision handler:", error);
      throw error;
    }
  });

  // PDF attachment handler
  ipcMain.handle("open-pdf-dialog", async () => {
    try {
      const result = await (dialog.showOpenDialog as any)({
        filters: [{ name: "PDF", extensions: ["pdf"] }],
        properties: ["openFile"]
      })
      if (result.canceled || !result.filePaths?.[0]) return null

      const pdfPath = result.filePaths[0]
      const buffer = fs.readFileSync(pdfPath)

      // Extract text and render images (pdf-parse v2 API)
      const { PDFParse } = require("pdf-parse")
      const parser = new PDFParse({ data: buffer })
      const pdfData = await parser.getText()
      const pageCount = pdfData.total

      if (pageCount > 30) {
        await parser.destroy()
        return { error: `PDF has ${pageCount} pages (max 30)` }
      }

      const screenshotResult = await parser.getScreenshot({ scale: 1.5 })
      await parser.destroy()

      const images = screenshotResult.pages.map((page: any) => {
        if (page.dataUrl) {
          return page.dataUrl.replace(/^data:image\/\w+;base64,/, "")
        }
        return page.data.toString("base64")
      })

      return {
        fileName: path.basename(pdfPath),
        pageCount,
        text: pdfData.text,
        images,
      }
    } catch (error: any) {
      console.error("Error in open-pdf-dialog:", error)
      return { error: error.message || "Failed to process PDF" }
    }
  })

  ipcMain.handle("quit-app", () => {
    app.quit()
  })

  // Window movement handlers
  ipcMain.handle("move-window-left", async () => {
    appState.moveWindowLeft()
  })

  ipcMain.handle("move-window-right", async () => {
    appState.moveWindowRight()
  })

  ipcMain.handle("move-window-up", async () => {
    appState.moveWindowUp()
  })

  ipcMain.handle("move-window-down", async () => {
    appState.moveWindowDown()
  })

  ipcMain.handle("center-and-show-window", async () => {
    appState.centerAndShowWindow()
  })

  ipcMain.handle("set-window-focusable", async (_, focusable: boolean) => {
    appState.setWindowFocusable(focusable)
  })

  // LLM Model Management Handlers
  ipcMain.handle("get-current-llm-config", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      return {
        provider: llmHelper.getCurrentProvider(),
        model: llmHelper.getCurrentModel(),
        isOllama: llmHelper.isUsingOllama()
      };
    } catch (error: any) {
      console.error("Error getting current LLM config:", error);
      throw error;
    }
  });

  ipcMain.handle("get-available-ollama-models", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      const models = await llmHelper.getOllamaModels();
      return models;
    } catch (error: any) {
      console.error("Error getting Ollama models:", error);
      throw error;
    }
  });

  ipcMain.handle("switch-to-ollama", async (_, model?: string, url?: string) => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      await llmHelper.switchToOllama(model, url);
      return { success: true };
    } catch (error: any) {
      console.error("Error switching to Ollama:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("switch-to-cloud", async (_, model?: string) => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      await llmHelper.switchToCloud(model);
      return { success: true };
    } catch (error: any) {
      console.error("Error switching to cloud model:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("test-llm-connection", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      const result = await llmHelper.testConnection();
      return result;
    } catch (error: any) {
      console.error("Error testing LLM connection:", error);
      return { success: false, error: error.message };
    }
  });

  // Lightweight screen capture for auto-context (no window hiding, no queue)
  ipcMain.handle("auto-capture-screen", async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1280, height: 720 }
      })
      if (sources.length === 0) return { success: false, error: "No screen source" }
      const base64 = sources[0].thumbnail.toJPEG(60).toString("base64")
      return { success: true, base64 }
    } catch (error: any) {
      console.error("Error auto-capturing screen:", error)
      return { success: false, error: error.message }
    }
  })

  // Desktop sources for system audio capture
  ipcMain.handle("get-desktop-sources", async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["window", "screen"],
        thumbnailSize: { width: 150, height: 150 }
      })
      return sources.map((s) => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL()
      }))
    } catch (error: any) {
      console.error("Error getting desktop sources:", error)
      throw error
    }
  })

  // Transcribe audio (webm base64 from renderer — no renderer-side conversion needed)
  // Fallback chain: Whisper CLI (webm native) → ffmpeg+Windows Speech Recognition
  ipcMain.handle("transcribe-audio", async (_, audioBase64: string) => {
    const tmpDir = os.tmpdir()
    const ts = Date.now()
    const webmPath = path.join(tmpDir, `tuams-audio-${ts}.webm`)
    const wavPath = path.join(tmpDir, `tuams-audio-${ts}.wav`)
    const lang = getCurrentLanguage().code

    try {
      const buffer = Buffer.from(audioBase64, "base64")
      fs.writeFileSync(webmPath, buffer)
      console.log(`[Transcribe] Saved ${buffer.length} bytes to ${webmPath} (lang=${lang})`)

      // 1) Try Deepgram REST API (accepts webm directly)
      const deepgramKey = process.env.DEEPGRAM_API_KEY || ""
      if (deepgramKey) {
        try {
          const dgText = await new Promise<string>((resolve, reject) => {
            const req = https.request(
              `https://api.deepgram.com/v1/listen?model=nova-3&language=${lang}&smart_format=true`,
              {
                method: "POST",
                headers: {
                  Authorization: `Token ${deepgramKey}`,
                  "Content-Type": "audio/webm",
                },
              },
              (res) => {
                let body = ""
                res.on("data", (c) => (body += c))
                res.on("end", () => {
                  try {
                    const json = JSON.parse(body)
                    const transcript = json?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ""
                    if (transcript) resolve(transcript)
                    else reject(new Error("No transcript in Deepgram response"))
                  } catch { reject(new Error("Invalid Deepgram response")) }
                })
              }
            )
            req.on("error", reject)
            req.setTimeout(30000, () => { req.destroy(); reject(new Error("Deepgram timeout")) })
            req.write(buffer)
            req.end()
          })
          console.log("[Transcribe] Deepgram REST succeeded")
          return { success: true, text: dgText }
        } catch (dgErr: any) {
          console.log("[Transcribe] Deepgram REST failed:", dgErr.message)
        }
      }

      // 2) Try AssemblyAI REST API (upload → transcribe → poll)
      const assemblyKey = process.env.ASSEMBLYAI_API_KEY || ""
      if (assemblyKey) {
        try {
          // Upload audio
          const uploadUrl = await new Promise<string>((resolve, reject) => {
            const req = https.request(
              "https://api.assemblyai.com/v2/upload",
              {
                method: "POST",
                headers: {
                  Authorization: assemblyKey,
                  "Content-Type": "application/octet-stream",
                  "Transfer-Encoding": "chunked",
                },
              },
              (res) => {
                let body = ""
                res.on("data", (c) => (body += c))
                res.on("end", () => {
                  try {
                    const json = JSON.parse(body)
                    if (json.upload_url) resolve(json.upload_url)
                    else reject(new Error("No upload_url"))
                  } catch { reject(new Error("Invalid upload response")) }
                })
              }
            )
            req.on("error", reject)
            req.setTimeout(30000, () => { req.destroy(); reject(new Error("Upload timeout")) })
            req.write(buffer)
            req.end()
          })

          // Create transcription
          const transcriptId = await new Promise<string>((resolve, reject) => {
            const payload = JSON.stringify({
              audio_url: uploadUrl,
              language_code: lang === "en" ? "en" : lang,
            })
            const req = https.request(
              "https://api.assemblyai.com/v2/transcript",
              {
                method: "POST",
                headers: {
                  Authorization: assemblyKey,
                  "Content-Type": "application/json",
                },
              },
              (res) => {
                let body = ""
                res.on("data", (c) => (body += c))
                res.on("end", () => {
                  try {
                    const json = JSON.parse(body)
                    if (json.id) resolve(json.id)
                    else reject(new Error("No transcript id"))
                  } catch { reject(new Error("Invalid transcript response")) }
                })
              }
            )
            req.on("error", reject)
            req.write(payload)
            req.end()
          })

          // Poll for result (max 60s)
          const aaiText = await new Promise<string>((resolve, reject) => {
            let attempts = 0
            const poll = () => {
              if (attempts++ > 30) { reject(new Error("AssemblyAI poll timeout")); return }
              https.get(
                `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
                { headers: { Authorization: assemblyKey } },
                (res) => {
                  let body = ""
                  res.on("data", (c) => (body += c))
                  res.on("end", () => {
                    try {
                      const json = JSON.parse(body)
                      if (json.status === "completed" && json.text) resolve(json.text)
                      else if (json.status === "error") reject(new Error(json.error || "Transcription error"))
                      else setTimeout(poll, 2000)
                    } catch { reject(new Error("Invalid poll response")) }
                  })
                }
              ).on("error", reject)
            }
            poll()
          })
          console.log("[Transcribe] AssemblyAI REST succeeded")
          return { success: true, text: aaiText }
        } catch (aaiErr: any) {
          console.log("[Transcribe] AssemblyAI REST failed:", aaiErr.message)
        }
      }

      // 3) Try Google Cloud STT REST API (needs wav conversion)
      const googleKey = process.env.GOOGLE_STT_API_KEY || ""
      if (googleKey) {
        try {
          // Convert webm to wav
          await new Promise<void>((resolve, reject) => {
            execFile(
              "ffmpeg",
              ["-y", "-i", webmPath, "-ar", "16000", "-ac", "1", "-f", "wav", wavPath],
              { timeout: 15000 },
              (error) => { if (error) reject(error); else resolve() }
            )
          })
          const wavBuffer = fs.readFileSync(wavPath)
          const wavBase64 = wavBuffer.toString("base64")

          const GOOGLE_LANG_MAP: Record<string, string> = {
            en: "en-US", zh: "zh-CN", es: "es-ES", fr: "fr-FR", de: "de-DE",
            ru: "ru-RU", ja: "ja-JP", ko: "ko-KR", pt: "pt-BR", it: "it-IT", vi: "vi-VN",
          }
          const googleLang = GOOGLE_LANG_MAP[lang] || `${lang}-${lang.toUpperCase()}`

          const gText = await new Promise<string>((resolve, reject) => {
            const payload = JSON.stringify({
              config: {
                encoding: "LINEAR16",
                sampleRateHertz: 16000,
                languageCode: googleLang,
                model: "latest_long",
                enableAutomaticPunctuation: true,
              },
              audio: { content: wavBase64 },
            })
            const req = https.request(
              `https://speech.googleapis.com/v1/speech:recognize?key=${googleKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
              },
              (res) => {
                let body = ""
                res.on("data", (c) => (body += c))
                res.on("end", () => {
                  try {
                    const json = JSON.parse(body)
                    const transcript = json?.results?.map((r: any) => r.alternatives?.[0]?.transcript || "").join(" ").trim()
                    if (transcript) resolve(transcript)
                    else reject(new Error("No transcript in Google response"))
                  } catch { reject(new Error("Invalid Google response")) }
                })
              }
            )
            req.on("error", reject)
            req.setTimeout(30000, () => { req.destroy(); reject(new Error("Google STT timeout")) })
            req.write(payload)
            req.end()
          })
          console.log("[Transcribe] Google STT REST succeeded")
          return { success: true, text: gText }
        } catch (gErr: any) {
          console.log("[Transcribe] Google STT REST failed:", gErr.message)
        }
      }

      // 4) Try Whisper CLI (supports webm natively — no conversion needed)
      try {
        const whisperText = await new Promise<string>((resolve, reject) => {
          execFile(
            "whisper",
            [webmPath, "--model", "tiny", "--output_format", "txt", "--output_dir", tmpDir],
            { timeout: 60000 },
            (error) => {
              if (error) {
                reject(error)
                return
              }
              const txtPath = webmPath.replace(".webm", ".txt")
              if (fs.existsSync(txtPath)) {
                const text = fs.readFileSync(txtPath, "utf-8").trim()
                try { fs.unlinkSync(txtPath) } catch {}
                resolve(text)
              } else {
                reject(new Error("Whisper output not found"))
              }
            }
          )
        })
        console.log("[Transcribe] Whisper succeeded")
        return { success: true, text: whisperText }
      } catch (whisperErr: any) {
        console.log("[Transcribe] Whisper unavailable:", whisperErr.message)
      }

      // 5) Fallback: convert webm→wav via ffmpeg, then Windows Speech Recognition
      if (process.platform === "win32") {
        try {
          if (!fs.existsSync(wavPath)) {
            await new Promise<void>((resolve, reject) => {
              execFile(
                "ffmpeg",
                ["-y", "-i", webmPath, "-ar", "16000", "-ac", "1", "-f", "wav", wavPath],
                { timeout: 15000 },
                (error) => {
                  if (error) reject(error)
                  else resolve()
                }
              )
            })
          }

          const psScript = `
Add-Type -AssemblyName System.Speech
$rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine
$rec.SetInputToWaveFile('${wavPath.replace(/\\/g, "\\\\")}')
$grammar = New-Object System.Speech.Recognition.DictationGrammar
$rec.LoadGrammar($grammar)
$result = $rec.Recognize()
if ($result) { $result.Text } else { '' }
$rec.Dispose()
`
          const winText = await new Promise<string>((resolve, reject) => {
            const psExe = path.join(
              process.env.SystemRoot || "C:\\Windows",
              "System32", "WindowsPowerShell", "v1.0", "powershell.exe"
            )
            execFile(
              psExe,
              ["-NoProfile", "-NonInteractive", "-Command", psScript],
              { timeout: 30000 },
              (error, stdout, stderr) => {
                if (error) {
                  console.error("[Transcribe] Win Speech stderr:", stderr)
                  reject(error)
                  return
                }
                resolve((stdout || "").trim())
              }
            )
          })
          if (winText) {
            console.log("[Transcribe] Windows Speech Recognition succeeded")
            return { success: true, text: winText }
          } else {
            return { success: false, error: "No speech detected" }
          }
        } catch (winErr: any) {
          console.error("[Transcribe] Windows Speech Recognition failed:", winErr.message)
          return { success: false, error: "Speech recognition failed. Install Whisper (pip install openai-whisper) for better results." }
        }
      }

      return { success: false, error: "No transcription engine available. Install Whisper: pip install openai-whisper" }
    } catch (error: any) {
      console.error("[Transcribe] Failed:", error.message)
      return { success: false, error: error.message }
    } finally {
      try { fs.unlinkSync(webmPath) } catch {}
      try { fs.unlinkSync(wavPath) } catch {}
    }
  })

  // ── Streaming Speech-to-Text (sherpa-onnx) ──
  const sherpaEngine = new SherpaEngine()

  // Check if sherpa-onnx model is ready
  ipcMain.handle("stt-check-sherpa", async () => {
    return { downloaded: isSherpaModelDownloaded() }
  })

  // Download sherpa-onnx model
  ipcMain.handle("stt-download-sherpa", async () => {
    try {
      const mainWindow = appState.getMainWindow()
      await downloadSherpaModel((file, percent) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("stt-download-progress", {
            engine: "sherpa",
            file,
            percent,
          })
        }
      })
      return { success: true }
    } catch (err: any) {
      console.error("[STT] Sherpa model download failed:", err.message)
      return { success: false, error: err.message }
    }
  })

  // Initialize sherpa-onnx recognizer
  ipcMain.handle("stt-init-sherpa", async () => {
    const mainWindow = appState.getMainWindow()
    if (!mainWindow) return { success: false, error: "No window" }
    const ok = await sherpaEngine.init(mainWindow)
    return { success: ok, error: ok ? undefined : "sherpa-onnx init failed" }
  })

  // Feed audio to sherpa-onnx (Float32 PCM, 16kHz mono, base64-encoded)
  ipcMain.handle("stt-feed-audio", async (_, base64Float32: string) => {
    if (!sherpaEngine.isRunning()) return
    try {
      const buf = Buffer.from(base64Float32, "base64")
      // Copy to a clean ArrayBuffer to avoid Node.js Buffer pool offset issues
      const ab = new ArrayBuffer(buf.byteLength)
      new Uint8Array(ab).set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
      const float32 = new Float32Array(ab)
      sherpaEngine.feedAudio(float32)
    } catch (err: any) {
      console.error("[STT] Feed error:", err.message)
    }
  })

  // Stop sherpa-onnx and get final text
  ipcMain.handle("stt-stop-sherpa", async () => {
    const text = sherpaEngine.stop()
    return { success: true, text }
  })

  // ── Deepgram cloud streaming STT ──
  const deepgramEngine = new DeepgramEngine()

  ipcMain.handle("stt-init-deepgram", async () => {
    const mainWindow = appState.getMainWindow()
    if (!mainWindow) return { success: false, error: "No window" }
    const lang = getCurrentLanguage().code
    const ok = await deepgramEngine.init(mainWindow, lang)
    return { success: ok, error: ok ? undefined : "Deepgram init failed (no API key or connection error)" }
  })

  // Feed audio to Deepgram (Float32 PCM → converted to int16 PCM)
  ipcMain.handle("stt-feed-audio-deepgram", async (_, base64Float32: string) => {
    if (!deepgramEngine.isRunning()) return
    try {
      const buf = Buffer.from(base64Float32, "base64")
      const ab = new ArrayBuffer(buf.byteLength)
      new Uint8Array(ab).set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
      const float32 = new Float32Array(ab)

      // Convert float32 [-1,1] to int16 [-32768,32767] for Deepgram linear16
      const int16 = Buffer.alloc(float32.length * 2)
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]))
        int16.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7FFF, i * 2)
      }
      deepgramEngine.feedAudio(int16)
    } catch (err: any) {
      console.error("[STT] Deepgram feed error:", err.message)
    }
  })

  ipcMain.handle("stt-stop-deepgram", async () => {
    const text = deepgramEngine.stop()
    return { success: true, text }
  })

  // ── AssemblyAI cloud streaming STT ──
  const assemblyEngine = new AssemblyAIEngine()

  ipcMain.handle("stt-init-assemblyai", async () => {
    const mainWindow = appState.getMainWindow()
    if (!mainWindow) return { success: false, error: "No window" }
    const lang = getCurrentLanguage().code
    const ok = await assemblyEngine.init(mainWindow, lang)
    return { success: ok, error: ok ? undefined : "AssemblyAI init failed" }
  })

  ipcMain.handle("stt-feed-audio-assemblyai", async (_, base64Float32: string) => {
    if (!assemblyEngine.isRunning()) return
    try {
      const buf = Buffer.from(base64Float32, "base64")
      const ab = new ArrayBuffer(buf.byteLength)
      new Uint8Array(ab).set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
      const float32 = new Float32Array(ab)

      const int16 = Buffer.alloc(float32.length * 2)
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]))
        int16.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7FFF, i * 2)
      }
      assemblyEngine.feedAudio(int16)
    } catch (err: any) {
      console.error("[STT] AssemblyAI feed error:", err.message)
    }
  })

  ipcMain.handle("stt-stop-assemblyai", async () => {
    const text = assemblyEngine.stop()
    return { success: true, text }
  })

  // ── Google Cloud STT ──
  const googleEngine = new GoogleSTTEngine()

  ipcMain.handle("stt-init-google-stt", async () => {
    const mainWindow = appState.getMainWindow()
    if (!mainWindow) return { success: false, error: "No window" }
    const lang = getCurrentLanguage().code
    const ok = await googleEngine.init(mainWindow, lang)
    return { success: ok, error: ok ? undefined : "Google STT init failed" }
  })

  ipcMain.handle("stt-feed-audio-google-stt", async (_, base64Float32: string) => {
    if (!googleEngine.isRunning()) return
    try {
      const buf = Buffer.from(base64Float32, "base64")
      const ab = new ArrayBuffer(buf.byteLength)
      new Uint8Array(ab).set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
      const float32 = new Float32Array(ab)

      const int16 = Buffer.alloc(float32.length * 2)
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]))
        int16.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7FFF, i * 2)
      }
      googleEngine.feedAudio(int16)
    } catch (err: any) {
      console.error("[STT] Google STT feed error:", err.message)
    }
  })

  ipcMain.handle("stt-stop-google-stt", async () => {
    const text = googleEngine.stop()
    return { success: true, text }
  })

  // ── Vosk model management (for vosk-browser fallback in renderer) ──

  // Check if vosk model is downloaded
  ipcMain.handle("stt-check-vosk", async () => {
    return { downloaded: isVoskModelDownloaded() }
  })

  // Download vosk model files
  ipcMain.handle("stt-download-vosk", async () => {
    try {
      const mainWindow = appState.getMainWindow()
      await downloadVoskModel((file, percent) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("stt-download-progress", {
            engine: "vosk",
            file,
            percent,
          })
        }
      })
      return { success: true }
    } catch (err: any) {
      console.error("[STT] Vosk model download failed:", err.message)
      return { success: false, error: err.message }
    }
  })

  // Get vosk model tar.gz URL (served via local HTTP to avoid IPC memory crash)
  let modelServer: ReturnType<typeof import("http").createServer> | null = null
  ipcMain.handle("stt-get-vosk-targz", async () => {
    try {
      const lang = getCurrentLanguage()
      const buffer = await getVoskModelTarGzForLang(lang)

      // Serve the tar.gz via a one-shot local HTTP server
      if (modelServer) { try { modelServer.close() } catch {} }

      const http = await import("http")
      return new Promise<{ success: boolean; url?: string; error?: string }>((resolve) => {
        modelServer = http.createServer((req, res) => {
          res.writeHead(200, {
            "Content-Type": "application/gzip",
            "Content-Length": buffer.length.toString(),
            "Access-Control-Allow-Origin": "*",
          })
          res.end(buffer)
        })
        modelServer.listen(0, "127.0.0.1", () => {
          const addr = modelServer!.address() as { port: number }
          const url = `http://127.0.0.1:${addr.port}/model.tar.gz`
          console.log(`[STT] Serving vosk model at ${url} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`)
          resolve({ success: true, url })
        })
        modelServer.on("error", (err: any) => {
          resolve({ success: false, error: err.message })
        })
      })
    } catch (err: any) {
      console.error("[STT] Vosk tar.gz creation failed:", err.message)
      return { success: false, error: err.message }
    }
  })

  // ── Language management ──
  ipcMain.handle("stt-get-languages", async () => {
    return getAvailableLanguages()
  })

  ipcMain.handle("stt-get-current-language", async () => {
    const lang = getCurrentLanguage()
    return { code: lang.code, name: lang.name }
  })

  ipcMain.handle("stt-switch-language", async (_event, code: string) => {
    const lang = VOSK_LANGUAGES.find(l => l.code === code)
    if (!lang) return { success: false, error: "Unknown language" }

    // Check if model is downloaded
    const languages = getAvailableLanguages()
    const target = languages.find(l => l.code === code)
    if (!target?.downloaded) {
      // Download the model
      const mainWindow = appState.getMainWindow()
      try {
        await downloadVoskLanguage(lang, (file, pct) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("language-download-progress", { code, file, pct })
          }
        })
        // Build tar.gz cache
        await getVoskModelTarGzForLang(lang)
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }

    saveLanguageConfig(code)
    return { success: true, name: lang.name }
  })
}
