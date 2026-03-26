// ipcHandlers.ts

import { ipcMain, app, desktopCapturer, dialog } from "electron"
import { AppState } from "./main"
import { execFile, spawn, ChildProcess } from "child_process"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
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
    const webmPath = path.join(tmpDir, `cluely-audio-${ts}.webm`)
    const wavPath = path.join(tmpDir, `cluely-audio-${ts}.wav`)

    try {
      const buffer = Buffer.from(audioBase64, "base64")
      fs.writeFileSync(webmPath, buffer)
      console.log(`[Transcribe] Saved ${buffer.length} bytes to ${webmPath}`)

      // 1) Try Whisper CLI (supports webm natively — no conversion needed)
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
        console.log("[Transcribe] Whisper unavailable, trying Windows Speech Recognition...", whisperErr.message)
      }

      // 2) Fallback: convert webm→wav via ffmpeg, then Windows Speech Recognition
      if (process.platform === "win32") {
        try {
          // Convert webm to wav via ffmpeg (required for System.Speech)
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
            // Use Windows PowerShell 5.1 (has System.Speech), not pwsh 7
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
    const ok = await deepgramEngine.init(mainWindow)
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
    const ok = await assemblyEngine.init(mainWindow)
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
    const ok = await googleEngine.init(mainWindow)
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
