import { app, BrowserWindow, Tray, Menu, nativeImage, powerMonitor, session } from "electron"
import { spawn } from "child_process"
import path from "path"
import { initializeIpcHandlers } from "./ipcHandlers"
import { WindowHelper } from "./WindowHelper"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { ShortcutsHelper } from "./shortcuts"
import { ProcessingHelper } from "./ProcessingHelper"
import {
  isSherpaModelDownloaded,
  downloadSherpaModel,
  isVoskModelDownloaded,
  downloadVoskModel,
} from "./StreamingSpeech"

export class AppState {
  private static instance: AppState | null = null

  private windowHelper: WindowHelper
  private screenshotHelper: ScreenshotHelper
  public shortcutsHelper: ShortcutsHelper
  public processingHelper: ProcessingHelper
  private tray: Tray | null = null

  // View management
  private view: "queue" | "solutions" = "queue"

  private problemInfo: {
    problem_statement: string
    input_format: Record<string, any>
    output_format: Record<string, any>
    constraints: Array<Record<string, any>>
    test_cases: Array<Record<string, any>>
  } | null = null // Allow null

  private hasDebugged: boolean = false

  // Processing events
  public readonly PROCESSING_EVENTS = {
    //global states
    UNAUTHORIZED: "procesing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",

    //states for generating the initial solution
    INITIAL_START: "initial-start",
    PROBLEM_EXTRACTED: "problem-extracted",
    SOLUTION_SUCCESS: "solution-success",
    INITIAL_SOLUTION_ERROR: "solution-error",

    //states for processing the debugging
    DEBUG_START: "debug-start",
    DEBUG_SUCCESS: "debug-success",
    DEBUG_ERROR: "debug-error"
  } as const

  constructor() {
    // Initialize WindowHelper with this
    this.windowHelper = new WindowHelper(this)

    // Initialize ScreenshotHelper
    this.screenshotHelper = new ScreenshotHelper(this.view)

    // Initialize ProcessingHelper
    this.processingHelper = new ProcessingHelper(this)

    // Initialize ShortcutsHelper
    this.shortcutsHelper = new ShortcutsHelper(this)
  }

  public static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState()
    }
    return AppState.instance
  }

  // Getters and Setters
  public getMainWindow(): BrowserWindow | null {
    return this.windowHelper.getMainWindow()
  }

  public getView(): "queue" | "solutions" {
    return this.view
  }

  public setView(view: "queue" | "solutions"): void {
    this.view = view
    this.screenshotHelper.setView(view)
  }

  public isVisible(): boolean {
    return this.windowHelper.isVisible()
  }

  public getScreenshotHelper(): ScreenshotHelper {
    return this.screenshotHelper
  }

  public getProblemInfo(): any {
    return this.problemInfo
  }

  public setProblemInfo(problemInfo: any): void {
    this.problemInfo = problemInfo
  }

  public getScreenshotQueue(): string[] {
    return this.screenshotHelper.getScreenshotQueue()
  }

  public getExtraScreenshotQueue(): string[] {
    return this.screenshotHelper.getExtraScreenshotQueue()
  }

  // Window management methods
  public createWindow(): void {
    this.windowHelper.createWindow()
  }

  public hideMainWindow(): void {
    this.windowHelper.hideMainWindow()
  }

  public showMainWindow(): void {
    this.windowHelper.showMainWindow()
  }

  public toggleMainWindow(): void {
    this.windowHelper.toggleMainWindow()
  }

  public toggleStealthMode(): void {
    this.windowHelper.toggleStealthMode()
  }

  public setWindowDimensions(width: number, height: number): void {
    this.windowHelper.setWindowDimensions(width, height)
  }

  public clearQueues(): void {
    this.screenshotHelper.clearQueues()

    // Clear problem info
    this.problemInfo = null

    // Reset view to initial state
    this.setView("queue")
  }

  public setWindowFocusable(focusable: boolean): void {
    this.windowHelper.setWindowFocusable(focusable)
  }

  // Screenshot management methods
  public async takeScreenshot(): Promise<string> {
    if (!this.getMainWindow()) throw new Error("No main window available")

    const screenshotPath = await this.screenshotHelper.takeScreenshot(
      () => this.hideMainWindow(),
      () => this.showMainWindow()
    )

    return screenshotPath
  }

  public async getImagePreview(filepath: string): Promise<string> {
    return this.screenshotHelper.getImagePreview(filepath)
  }

  public async deleteScreenshot(
    path: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.screenshotHelper.deleteScreenshot(path)
  }

  // New methods to move the window
  public moveWindowLeft(): void {
    this.windowHelper.moveWindowLeft()
  }

  public moveWindowRight(): void {
    this.windowHelper.moveWindowRight()
  }
  public moveWindowDown(): void {
    this.windowHelper.moveWindowDown()
  }
  public moveWindowUp(): void {
    this.windowHelper.moveWindowUp()
  }

  public resizeWindow(dw: number, dh: number): void {
    this.windowHelper.resizeWindow(dw, dh)
  }

  public centerAndShowWindow(): void {
    this.windowHelper.centerAndShowWindow()
  }

  public createTray(): void {
    const iconPath = path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'), 'assets', 'tray-icon.png')
    let trayImage: Electron.NativeImage
    try {
      trayImage = nativeImage.createFromPath(iconPath)
      trayImage = trayImage.resize({ width: 16, height: 16 })
    } catch (error) {
      console.log("Tray icon not found, using empty image")
      trayImage = nativeImage.createEmpty()
    }

    this.tray = new Tray(trayImage)
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Interview Coder',
        click: () => {
          this.centerAndShowWindow()
        }
      },
      {
        label: 'Toggle Window',
        click: () => {
          this.toggleMainWindow()
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Take Screenshot (Cmd+H)',
        click: async () => {
          try {
            const screenshotPath = await this.takeScreenshot()
            const preview = await this.getImagePreview(screenshotPath)
            const mainWindow = this.getMainWindow()
            if (mainWindow) {
              mainWindow.webContents.send("screenshot-taken", {
                path: screenshotPath,
                preview
              })
            }
          } catch (error) {
            console.error("Error taking screenshot from tray:", error)
          }
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Quit',
        accelerator: 'Command+Q',
        click: () => {
          app.quit()
        }
      }
    ])
    
    this.tray.setToolTip('Interview Coder - Press Cmd+Shift+Space to show')
    this.tray.setContextMenu(contextMenu)
    
    // Set a title for macOS (will appear in menu bar)
    if (process.platform === 'darwin') {
      this.tray.setTitle('IC')
    }
    
    // Double-click to show window
    this.tray.on('double-click', () => {
      this.centerAndShowWindow()
    })
  }

  public setHasDebugged(value: boolean): void {
    this.hasDebugged = value
  }

  public getHasDebugged(): boolean {
    return this.hasDebugged
  }
}

// Application initialization
async function initializeApp() {
  const appState = AppState.getInstance()

  // Ensure Ollama server is running (no-op if already started)
  try {
    const ollama = spawn("ollama", ["serve"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    })
    ollama.unref()
    console.log("[App] Spawned ollama serve (pid:", ollama.pid, ")")
  } catch (err) {
    console.warn("[App] Could not start ollama serve:", err)
  }

  // Auto-pull required models in background (non-blocking)
  const modelsToEnsure = [
    "glm-5:cloud",
    "gpt-oss:20b-cloud",
    "llama3.3:cloud",
    "qwen2.5:cloud",
    "mixtral:8x7b",
    "qwen3-vl:235b-cloud",
    "qwen3.5:cloud",
  ]
  // Wait a bit for ollama serve to be ready, then pull models sequentially
  setTimeout(async () => {
    for (const model of modelsToEnsure) {
      try {
        const pull = spawn("ollama", ["pull", model], {
          detached: true,
          stdio: "ignore",
          windowsHide: true
        })
        pull.unref()
        console.log(`[App] Started pulling model: ${model}`)
      } catch (err) {
        console.warn(`[App] Could not pull ${model}:`, err)
      }
    }
  }, 1500)

  // Initialize IPC handlers before window creation
  initializeIpcHandlers(appState)

  app.whenReady().then(() => {
    console.log("App is ready")

    // Grant microphone + desktop audio permissions for MediaRecorder / getUserMedia
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      const allowed = ["media", "audioCapture", "mediaKeySystem", "desktopCapture"]
      callback(allowed.includes(permission))
    })

    appState.createWindow()
    appState.createTray()
    // Register global shortcuts using ShortcutsHelper
    appState.shortcutsHelper.registerGlobalShortcuts()

    // Download speech models in background (non-blocking)
    ;(async () => {
      try {
        if (!isSherpaModelDownloaded()) {
          console.log("[App] Downloading sherpa-onnx speech model in background...")
          await downloadSherpaModel((file, pct) => {
            if (pct % 25 === 0) console.log(`[App] sherpa model: ${file} ${pct}%`)
          })
          console.log("[App] sherpa-onnx model download complete")
        } else {
          console.log("[App] sherpa-onnx model already downloaded")
        }
      } catch (err) {
        console.warn("[App] sherpa-onnx model download failed:", err)
      }
      try {
        if (!isVoskModelDownloaded()) {
          console.log("[App] Downloading vosk speech model in background...")
          await downloadVoskModel()
          console.log("[App] vosk model download complete")
        } else {
          console.log("[App] vosk model already downloaded")
        }
      } catch (err) {
        console.warn("[App] vosk model download failed:", err)
      }
    })()
  })

  app.on("activate", () => {
    console.log("App activated")
    if (appState.getMainWindow() === null) {
      appState.createWindow()
    }
  })

  // Quit when all windows are closed, except on macOS
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })

  app.dock?.hide() // Hide dock icon (optional)
  app.commandLine.appendSwitch("disable-background-timer-throttling")

  // Re-register shortcuts after system sleep/lock, as Windows drops them on resume
  app.whenReady().then(() => {
    powerMonitor.on("resume", () => {
      console.log("[App] System resumed — re-registering shortcuts")
      appState.shortcutsHelper.reregisterShortcuts()
    })
    powerMonitor.on("unlock-screen", () => {
      console.log("[App] Screen unlocked — re-registering shortcuts")
      appState.shortcutsHelper.reregisterShortcuts()
    })
  })
}

// Start the application
initializeApp().catch(console.error)
