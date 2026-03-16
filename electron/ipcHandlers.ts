// ipcHandlers.ts

import { ipcMain, app, desktopCapturer } from "electron"
import { AppState } from "./main"
import { execFile } from "child_process"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"

export function initializeIpcHandlers(appState: AppState): void {
  ipcMain.handle(
    "update-content-dimensions",
    async (event, { width, height }: { width: number; height: number }) => {
      if (width && height) {
        appState.setWindowDimensions(width, height)
      }
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
}
