// ipcHandlers.ts

import { ipcMain, app, desktopCapturer, dialog } from "electron"
import { AppState } from "./main"
import { execFile, spawn, ChildProcess } from "child_process"
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

  // ── Live transcription (streaming Windows Speech Recognition) ──
  let liveTranscriptionProcess: ChildProcess | null = null
  let liveTranscriptAccumulated = ""

  ipcMain.handle("start-live-transcription", async () => {
    if (liveTranscriptionProcess) {
      return { success: false, error: "Already running" }
    }
    if (process.platform !== "win32") {
      return { success: false, error: "Live transcription only supported on Windows" }
    }

    liveTranscriptAccumulated = ""

    const psExe = path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32", "WindowsPowerShell", "v1.0", "powershell.exe"
    )

    // C# code that runs continuous speech recognition from default mic
    // Outputs "PARTIAL:text" and "FINAL:text" lines to stdout
    const csCode = `
using System;
using System.Speech.Recognition;
public class LiveSR {
  public static void Start() {
    var rec = new SpeechRecognitionEngine();
    rec.LoadGrammar(new DictationGrammar());
    rec.SetInputToDefaultAudioDevice();
    rec.SpeechHypothesized += (s, e) => {
      Console.WriteLine("PARTIAL:" + e.Result.Text);
      Console.Out.Flush();
    };
    rec.SpeechRecognized += (s, e) => {
      Console.WriteLine("FINAL:" + e.Result.Text);
      Console.Out.Flush();
    };
    rec.RecognizeAsync(RecognizeMode.Multiple);
    Console.ReadLine();
    rec.RecognizeAsyncCancel();
    rec.Dispose();
  }
}
`
    const psScript = `
Add-Type -AssemblyName System.Speech
Add-Type -TypeDefinition @'
${csCode}
'@ -ReferencedAssemblies System.Speech
[LiveSR]::Start()
`

    try {
      const proc = spawn(psExe, ["-NoProfile", "-NonInteractive", "-Command", psScript], {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"]
      })
      liveTranscriptionProcess = proc

      proc.stdout?.on("data", (data: Buffer) => {
        const lines = data.toString().split("\n").filter(l => l.trim())
        for (const line of lines) {
          const mainWindow = appState.getMainWindow()
          if (!mainWindow || mainWindow.isDestroyed()) continue

          if (line.startsWith("FINAL:")) {
            const text = line.slice(6).trim()
            if (text) {
              liveTranscriptAccumulated += (liveTranscriptAccumulated ? " " : "") + text
              mainWindow.webContents.send("live-transcript", { type: "final", text: liveTranscriptAccumulated })
            }
          } else if (line.startsWith("PARTIAL:")) {
            const partial = line.slice(8).trim()
            if (partial) {
              const display = liveTranscriptAccumulated + (liveTranscriptAccumulated ? " " : "") + partial
              mainWindow.webContents.send("live-transcript", { type: "partial", text: display })
            }
          }
        }
      })

      proc.stderr?.on("data", (data: Buffer) => {
        console.log("[LiveTranscription] stderr:", data.toString().trim())
      })

      proc.on("close", () => {
        liveTranscriptionProcess = null
      })

      proc.on("error", (err) => {
        console.error("[LiveTranscription] Process error:", err)
        liveTranscriptionProcess = null
      })

      console.log("[LiveTranscription] Started")
      return { success: true }
    } catch (err: any) {
      console.error("[LiveTranscription] Failed to start:", err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle("stop-live-transcription", async () => {
    if (liveTranscriptionProcess) {
      try {
        // Send newline to stdin to unblock Console.ReadLine() → graceful shutdown
        liveTranscriptionProcess.stdin?.write("\n")
        liveTranscriptionProcess.stdin?.end()
      } catch {}
      // Force kill after 1s if still alive
      const proc = liveTranscriptionProcess
      setTimeout(() => {
        try { proc?.kill() } catch {}
      }, 1000)
      liveTranscriptionProcess = null
    }
    const result = liveTranscriptAccumulated
    liveTranscriptAccumulated = ""
    console.log("[LiveTranscription] Stopped, accumulated:", result)
    return { success: true, text: result }
  })
}
