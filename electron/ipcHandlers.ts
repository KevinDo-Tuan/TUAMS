// ipcHandlers.ts

import { ipcMain, app, desktopCapturer, dialog } from "electron"
import { AppState } from "./main"
import { execFile, spawn, ChildProcess } from "child_process"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import {
  SherpaEngine,
  isSherpaModelDownloaded,
  downloadSherpaModel,
  isVoskModelDownloaded,
  downloadVoskModel,
  getVoskModelTarGz,
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
      const result = await appState.processingHelper.getLLMHelper().chatWithGemini(message);
      return result;
    } catch (error: any) {
      console.error("Error in ai-chat handler:", error);
      throw error;
    }
  });

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
      await llmHelper.switchToGemini(model);
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

  // Transcribe audio (WAV base64 from renderer)
  // Fallback chain: Whisper CLI → Windows Speech Recognition
  ipcMain.handle("transcribe-audio", async (_, audioBase64: string) => {
    const tmpDir = os.tmpdir()
    const wavPath = path.join(tmpDir, `cluely-audio-${Date.now()}.wav`)

    try {
      const buffer = Buffer.from(audioBase64, "base64")
      fs.writeFileSync(wavPath, buffer)
      console.log(`[Transcribe] Saved ${buffer.length} bytes to ${wavPath}`)

      // 1) Try Whisper CLI
      try {
        const whisperText = await new Promise<string>((resolve, reject) => {
          execFile(
            "whisper",
            [wavPath, "--model", "tiny", "--output_format", "txt", "--output_dir", tmpDir],
            { timeout: 60000 },
            (error) => {
              if (error) {
                reject(error)
                return
              }
              const txtPath = wavPath.replace(".wav", ".txt")
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

      // 2) Fallback: Windows built-in Speech Recognition (System.Speech)
      if (process.platform === "win32") {
        try {
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
      const float32 = new Float32Array(
        buf.buffer,
        buf.byteOffset,
        buf.byteLength / 4
      )
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

  // Get vosk model as tar.gz buffer (for vosk-browser in renderer)
  ipcMain.handle("stt-get-vosk-targz", async () => {
    try {
      const buffer = await getVoskModelTarGz()
      return { success: true, data: buffer.toString("base64") }
    } catch (err: any) {
      console.error("[STT] Vosk tar.gz creation failed:", err.message)
      return { success: false, error: err.message }
    }
  })
}
