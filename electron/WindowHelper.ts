
import { BrowserWindow, screen } from "electron"
import { AppState } from "main"
import path from "node:path"

// Native Win32 FFI for stealth mode (screen capture exclusion)
let SetWindowDisplayAffinity: ((hwnd: number, affinity: number) => boolean) | null = null
let GetLastError: (() => number) | null = null
let GetWindowLongW: ((hwnd: number, nIndex: number) => number) | null = null
let SetWindowLongW: ((hwnd: number, nIndex: number, dwNewLong: number) => number) | null = null
let GetForegroundWindow: (() => number) | null = null
let GetWindowTextW: ((hwnd: number, buf: Buffer, maxCount: number) => number) | null = null
const GWL_EXSTYLE = -20
const WS_EX_LAYERED = 0x00080000

if (process.platform === "win32") {
  try {
    const koffi = require("koffi")
    const user32 = koffi.load("user32.dll")
    const kernel32 = koffi.load("kernel32.dll")
    SetWindowDisplayAffinity = user32.func("bool __stdcall SetWindowDisplayAffinity(uintptr_t hwnd, uint32_t affinity)")
    GetLastError = kernel32.func("uint32_t __stdcall GetLastError()")
    GetWindowLongW = user32.func("long __stdcall GetWindowLongW(uintptr_t hwnd, int nIndex)")
    SetWindowLongW = user32.func("long __stdcall SetWindowLongW(uintptr_t hwnd, int nIndex, long dwNewLong)")
    GetForegroundWindow = user32.func("uintptr_t __stdcall GetForegroundWindow()")
    GetWindowTextW = user32.func("int __stdcall GetWindowTextW(uintptr_t hwnd, uint16_t*, int nMaxCount)")
  } catch (err) {
    console.warn("[WindowHelper] koffi not available, display affinity disabled:", err)
  }
}

// Extract HWND value from Electron's getNativeWindowHandle() Buffer
function readHwnd(buf: Buffer): number {
  // HWND values always fit in 32 bits even on 64-bit Windows
  return buf.readUInt32LE(0)
}

const isDev = process.env.NODE_ENV === "development"

const startUrl = isDev
  ? "http://localhost:5180"
  : `file://${path.join(__dirname, "../dist/index.html")}`

export class WindowHelper {
  private mainWindow: BrowserWindow | null = null
  private isWindowVisible: boolean = false
  private windowPosition: { x: number; y: number } | null = null
  private windowSize: { width: number; height: number } | null = null
  private appState: AppState
  private stealthMode: boolean = false
  private screenShareDetectionInterval: ReturnType<typeof setInterval> | null = null
  private autoStealthActive: boolean = false

  private screenWidth: number = 0
  private screenHeight: number = 0
  private step: number = 60
  private currentX: number = 0
  private currentY: number = 0

  constructor(appState: AppState) {
    this.appState = appState
  }

  public setWindowDimensions(width: number, height: number): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    // Get current window position
    const [currentX, currentY] = this.mainWindow.getPosition()

    // Get screen dimensions
    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize

    // Use 75% width if debugging has occurred, otherwise use 60%
    const maxAllowedWidth = Math.floor(
      workArea.width * (this.appState.getHasDebugged() ? 0.75 : 0.5)
    )

    // Ensure width doesn't exceed max allowed width and height is reasonable
    const newWidth = Math.min(width + 32, maxAllowedWidth)
    const newHeight = Math.ceil(height)

    // Center the window horizontally if it would go off screen
    const maxX = workArea.width - newWidth
    const newX = Math.min(Math.max(currentX, 0), maxX)

    // Update window bounds
    this.mainWindow.setBounds({
      x: newX,
      y: currentY,
      width: newWidth,
      height: newHeight
    })

    // Update internal state
    this.windowPosition = { x: newX, y: currentY }
    this.windowSize = { width: newWidth, height: newHeight }
    this.currentX = newX
  }

  public createWindow(): void {
    if (this.mainWindow !== null) return

    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize
    this.screenWidth = workArea.width
    this.screenHeight = workArea.height

    
    const windowSettings: Electron.BrowserWindowConstructorOptions = {
      width:  480,
      height: 500,
      minWidth: 300,
      minHeight: 100,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js")
      },
      show: false, // Start hidden, then show after setup
      alwaysOnTop: true,
      frame: false,
      transparent: true,
      fullscreenable: false,
      hasShadow: false,
      focusable: true,
      resizable: true,
      movable: true,
      x: 100, // Start at a visible position
      y: 100
    }

    this.mainWindow = new BrowserWindow(windowSettings)
    // this.mainWindow.webContents.openDevTools()

    if (process.platform === "darwin") {
      this.mainWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true
      })
      this.mainWindow.setHiddenInMissionControl(true)
      this.mainWindow.setAlwaysOnTop(true, "screen-saver")
    } else if (process.platform === "linux") {
      // Linux-specific optimizations for better compatibility
      if (this.mainWindow.setHasShadow) {
        this.mainWindow.setHasShadow(false)
      }
      // Keep window focusable on Linux for proper interaction
      this.mainWindow.setFocusable(true)
      this.mainWindow.setAlwaysOnTop(true, "screen-saver")
    } else {
      // Windows: use "screen-saver" level to stay above fullscreen apps (e.g. Azota)
      this.mainWindow.setAlwaysOnTop(true, "screen-saver")
    }
    this.mainWindow.setSkipTaskbar(true)

    this.mainWindow.loadURL(startUrl).catch((err) => {
      console.error("Failed to load URL:", err)
    })

    // Show window after loading URL and center it
    this.mainWindow.once('ready-to-show', () => {
      if (this.mainWindow) {
        this.centerWindow()
        this.mainWindow.show()
        this.mainWindow.focus()
        this.mainWindow.setAlwaysOnTop(true, "screen-saver")
        console.log("Window is now visible and centered")
      }
    })

    const bounds = this.mainWindow.getBounds()
    this.windowPosition = { x: bounds.x, y: bounds.y }
    this.windowSize = { width: bounds.width, height: bounds.height }
    this.currentX = bounds.x
    this.currentY = bounds.y

    this.setupWindowListeners()
    this.isWindowVisible = true
  }

  private setupWindowListeners(): void {
    if (!this.mainWindow) return

    this.mainWindow.on("move", () => {
      if (this.mainWindow) {
        const bounds = this.mainWindow.getBounds()
        this.windowPosition = { x: bounds.x, y: bounds.y }
        this.currentX = bounds.x
        this.currentY = bounds.y
      }
    })

    this.mainWindow.on("resize", () => {
      if (this.mainWindow) {
        const bounds = this.mainWindow.getBounds()
        this.windowSize = { width: bounds.width, height: bounds.height }
      }
    })

    this.mainWindow.on("closed", () => {
      this.mainWindow = null
      this.isWindowVisible = false
      this.windowPosition = null
      this.windowSize = null
    })
  }

  // Hide window from screen capture on Windows using native FFI
  // NOTE: We avoid Electron's setContentProtection() as it breaks transparent window rendering
  private applyDisplayAffinity(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    if (process.platform !== "win32") return

    if (!SetWindowDisplayAffinity) {
      console.warn("[WindowHelper] koffi not available — stealth capture protection unavailable")
      return
    }

    try {
      const hwnd = readHwnd(this.mainWindow.getNativeWindowHandle())
      console.log(`[WindowHelper] HWND: 0x${hwnd.toString(16)}`)

      // Try direct call first
      if (SetWindowDisplayAffinity(hwnd, 0x11)) {
        console.log("[WindowHelper] WDA_EXCLUDEFROMCAPTURE set (direct)")
        return
      }
      const directErr = GetLastError ? GetLastError() : -1
      console.log(`[WindowHelper] Direct WDA call failed, err=${directErr}. Trying WS_EX_LAYERED workaround...`)

      // Workaround: transparent windows have WS_EX_LAYERED which blocks SetWindowDisplayAffinity.
      // Temporarily remove it, set affinity, then restore it.
      if (GetWindowLongW && SetWindowLongW) {
        const exStyle = GetWindowLongW(hwnd, GWL_EXSTYLE)
        const isLayered = (exStyle & WS_EX_LAYERED) !== 0
        console.log(`[WindowHelper] ExStyle: 0x${(exStyle >>> 0).toString(16)}, isLayered: ${isLayered}`)

        if (isLayered) {
          // Remove WS_EX_LAYERED
          SetWindowLongW(hwnd, GWL_EXSTYLE, exStyle & ~WS_EX_LAYERED)

          // Set affinity while not layered
          const success = SetWindowDisplayAffinity(hwnd, 0x11)
          const err = GetLastError ? GetLastError() : -1
          console.log(`[WindowHelper] After removing WS_EX_LAYERED: WDA result=${success}, err=${err}`)

          // Restore WS_EX_LAYERED for transparency
          SetWindowLongW(hwnd, GWL_EXSTYLE, exStyle)

          if (success) {
            console.log("[WindowHelper] WDA_EXCLUDEFROMCAPTURE set (via layered workaround)")
            return
          }
        }
      }

      // Final fallback: try WDA_MONITOR
      if (SetWindowDisplayAffinity(hwnd, 0x01)) {
        console.log("[WindowHelper] WDA_MONITOR set (black rectangle in capture)")
        return
      }

      console.warn("[WindowHelper] All WDA methods failed — stealth capture protection unavailable")
    } catch (err) {
      console.error("[WindowHelper] Failed to set display affinity:", err)
    }
  }

  // Restore normal display affinity (visible to screen capture)
  private removeDisplayAffinity(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    if (process.platform !== "win32") return

    if (!SetWindowDisplayAffinity) return

    try {
      const hwnd = readHwnd(this.mainWindow.getNativeWindowHandle())
      // WDA_NONE (0x00) — normal capture behavior
      if (SetWindowDisplayAffinity(hwnd, 0x00)) {
        console.log("[WindowHelper] Display affinity removed: WDA_NONE")
      } else {
        const err = GetLastError ? GetLastError() : -1
        console.warn(`[WindowHelper] Failed to remove display affinity, GetLastError: ${err}`)
      }
    } catch (err) {
      console.error("[WindowHelper] Failed to remove display affinity:", err)
    }
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  public isVisible(): boolean {
    return this.isWindowVisible
  }

  public hideMainWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn("Main window does not exist or is destroyed.")
      return
    }

    const bounds = this.mainWindow.getBounds()
    this.windowPosition = { x: bounds.x, y: bounds.y }
    this.windowSize = { width: bounds.width, height: bounds.height }
    this.mainWindow.hide()
    this.isWindowVisible = false
  }

  public showMainWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn("Main window does not exist or is destroyed.")
      return
    }

    if (this.windowPosition && this.windowSize) {
      this.mainWindow.setBounds({
        x: this.windowPosition.x,
        y: this.windowPosition.y,
        width: this.windowSize.width,
        height: this.windowSize.height
      })
    }

    this.mainWindow.showInactive()
    if (this.stealthMode) {
      this.applyDisplayAffinity()
    }

    this.isWindowVisible = true
  }

  public toggleMainWindow(): void {
    if (this.isWindowVisible) {
      this.hideMainWindow()
    } else {
      this.showMainWindow()
    }
  }

  public toggleStealthMode(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    this.stealthMode = !this.stealthMode
    console.log(`[WindowHelper] Stealth mode: ${this.stealthMode ? "ON" : "OFF"}`)

    if (this.stealthMode) {
      this.applyDisplayAffinity()
    } else {
      this.removeDisplayAffinity()
    }

    this.mainWindow.webContents.send("stealth-mode-changed", this.stealthMode)
  }

  private centerWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return
    }

    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize
    
    // Get current window size or use defaults
    const windowBounds = this.mainWindow.getBounds()
    const windowWidth = windowBounds.width || 400
    const windowHeight = windowBounds.height || 600
    
    // Calculate center position
    const centerX = Math.floor((workArea.width - windowWidth) / 2)
    const centerY = Math.floor((workArea.height - windowHeight) / 2)
    
    // Set window position
    this.mainWindow.setBounds({
      x: centerX,
      y: centerY,
      width: windowWidth,
      height: windowHeight
    })
    
    // Update internal state
    this.windowPosition = { x: centerX, y: centerY }
    this.windowSize = { width: windowWidth, height: windowHeight }
    this.currentX = centerX
    this.currentY = centerY
  }

  public centerAndShowWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn("Main window does not exist or is destroyed.")
      return
    }

    this.centerWindow()
    this.mainWindow.show()
    this.mainWindow.focus()
    this.mainWindow.setAlwaysOnTop(true, "screen-saver")
    if (this.stealthMode) {
      this.applyDisplayAffinity()
    }
    this.isWindowVisible = true

    console.log(`Window centered and shown`)
  }

  public setWindowFocusable(focusable: boolean): void {
    if (!this.mainWindow) return
    this.mainWindow.setFocusable(focusable)
    if (focusable) {
      this.mainWindow.focus()
    }
  }

  private syncPosition(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    const [x, y] = this.mainWindow.getPosition()
    this.currentX = x
    this.currentY = y
  }

  public moveWindowRight(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.syncPosition()
    const [w] = this.mainWindow.getSize()
    this.currentX = Math.min(this.screenWidth - w / 2, this.currentX + this.step)
    this.mainWindow.setPosition(Math.round(this.currentX), Math.round(this.currentY))
  }

  public moveWindowLeft(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.syncPosition()
    const [w] = this.mainWindow.getSize()
    this.currentX = Math.max(-w / 2, this.currentX - this.step)
    this.mainWindow.setPosition(Math.round(this.currentX), Math.round(this.currentY))
  }

  public moveWindowDown(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.syncPosition()
    const [, h] = this.mainWindow.getSize()
    this.currentY = Math.min(this.screenHeight - h / 2, this.currentY + this.step)
    this.mainWindow.setPosition(Math.round(this.currentX), Math.round(this.currentY))
  }

  public moveWindowUp(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.syncPosition()
    const [, h] = this.mainWindow.getSize()
    this.currentY = Math.max(-h / 2, this.currentY - this.step)
    this.mainWindow.setPosition(Math.round(this.currentX), Math.round(this.currentY))
  }

  public resizeWindow(dw: number, dh: number): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    const [w, h] = this.mainWindow.getSize()
    const newW = Math.max(300, w + dw)
    const newH = Math.max(100, h + dh)
    this.mainWindow.setSize(Math.round(newW), Math.round(newH))
  }

  // ── Screen share detection ──
  // Polls the foreground window title every 3s. If a known screen-sharing app
  // (Zoom, Teams, Meet, Discord, Webex) is detected with a sharing indicator,
  // auto-enable stealth mode. Restore when sharing stops.

  private static SCREEN_SHARE_PATTERNS = [
    /zoom/i,
    /teams/i,
    /google meet/i,
    /meet\.google/i,
    /webex/i,
    /discord/i,
    /screen share/i,
    /sharing your screen/i,
    /you are sharing/i,
    /presenting/i,
  ]

  private getForegroundWindowTitle(): string {
    if (!GetForegroundWindow || !GetWindowTextW) return ""
    try {
      const hwnd = GetForegroundWindow()
      if (!hwnd) return ""
      const buf = Buffer.alloc(512)
      const len = GetWindowTextW(hwnd, buf, 256)
      if (len <= 0) return ""
      // GetWindowTextW writes UTF-16LE
      return buf.slice(0, len * 2).toString("utf16le")
    } catch {
      return ""
    }
  }

  public startScreenShareDetection(): void {
    if (this.screenShareDetectionInterval) return
    if (process.platform !== "win32") return

    console.log("[WindowHelper] Screen share detection started")
    this.screenShareDetectionInterval = setInterval(() => {
      const title = this.getForegroundWindowTitle()
      if (!title) return

      const isSharing = WindowHelper.SCREEN_SHARE_PATTERNS.some((p) => p.test(title))

      if (isSharing && !this.autoStealthActive) {
        // Detected screen sharing app — auto-enable stealth
        this.autoStealthActive = true
        if (!this.stealthMode) {
          console.log(`[WindowHelper] Auto-stealth ON (detected: "${title.slice(0, 60)}")`)
          this.stealthMode = true
          this.applyDisplayAffinity()
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send("stealth-mode-changed", true)
          }
        }
      } else if (!isSharing && this.autoStealthActive) {
        // Screen sharing app no longer in foreground — disable auto-stealth
        this.autoStealthActive = false
        if (this.stealthMode) {
          console.log("[WindowHelper] Auto-stealth OFF")
          this.stealthMode = false
          this.removeDisplayAffinity()
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send("stealth-mode-changed", false)
          }
        }
      }
    }, 3000)
  }

  public stopScreenShareDetection(): void {
    if (this.screenShareDetectionInterval) {
      clearInterval(this.screenShareDetectionInterval)
      this.screenShareDetectionInterval = null
      this.autoStealthActive = false
      console.log("[WindowHelper] Screen share detection stopped")
    }
  }

  public isStealthMode(): boolean {
    return this.stealthMode
  }
}
