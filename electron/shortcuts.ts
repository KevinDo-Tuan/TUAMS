import { globalShortcut, app, BrowserWindow, clipboard } from "electron"
import { AppState } from "./main"

// Native Win32 FFI for keyboard simulation (replaces slow PowerShell SendKeys)
let keybd_event: ((vk: number, scan: number, flags: number, extra: number) => void) | null = null
if (process.platform === "win32") {
  try {
    const koffi = require("koffi")
    const user32 = koffi.load("user32.dll")
    keybd_event = user32.func("void keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, uintptr_t dwExtraInfo)")
  } catch (err) {
    console.warn("[Shortcuts] koffi not available for SendKeys:", err)
  }
}

const VK_CONTROL = 0x11
const VK_A = 0x41
const VK_C = 0x43
const KEYEVENTF_KEYUP = 0x02

export class ShortcutsHelper {
  private appState: AppState

  constructor(appState: AppState) {
    this.appState = appState
  }

  public registerGlobalShortcuts(): void {
    const register = (key: string, fn: () => void) => {
      globalShortcut.register(key, fn)
      const ok = globalShortcut.isRegistered(key)
      if (!ok) console.error(`[Shortcuts] Failed to register: ${key}`)
      else console.log(`[Shortcuts] Registered: ${key}`)
    }

    register("CommandOrControl+Shift+Space", () => {
      this.appState.centerAndShowWindow()
    })

    register("CommandOrControl+Shift+H", async () => {
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow) {
        try {
          const screenshotPath = await this.appState.takeScreenshot()
          const preview = await this.appState.getImagePreview(screenshotPath)
          mainWindow.webContents.send("screenshot-taken", { path: screenshotPath, preview })
        } catch (error) {
          console.error("Error capturing screenshot:", error)
        }
      }
    })

    register("CommandOrControl+Shift+Enter", async () => {
      await this.appState.processingHelper.processScreenshots()
    })

    register("CommandOrControl+Shift+R", () => {
      this.appState.processingHelper.cancelOngoingRequests()
      this.appState.clearQueues()
      this.appState.setView("queue")
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("reset-view")
      }
    })

    register("CommandOrControl+Shift+Left", () => {
      this.appState.moveWindowLeft()
    })

    register("CommandOrControl+Shift+Right", () => {
      this.appState.moveWindowRight()
    })

    register("CommandOrControl+Shift+Down", () => {
      this.appState.moveWindowDown()
    })

    register("CommandOrControl+Shift+Up", () => {
      this.appState.moveWindowUp()
    })

    // Resize window shortcuts
    register("CommandOrControl+Alt+Right", () => {
      this.appState.resizeWindow(60, 0)
    })
    register("CommandOrControl+Alt+Left", () => {
      this.appState.resizeWindow(-60, 0)
    })
    register("CommandOrControl+Alt+Down", () => {
      this.appState.resizeWindow(0, 60)
    })
    register("CommandOrControl+Alt+Up", () => {
      this.appState.resizeWindow(0, -60)
    })

    register("CommandOrControl+Shift+K", async () => {
      const mainWindow = this.appState.getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed()) return

      try {
        // Simulate Ctrl+A then Ctrl+C using native keybd_event (<1ms vs 1000ms+ PowerShell)
        if (keybd_event) {
          // Ctrl+A (select all)
          keybd_event(VK_CONTROL, 0, 0, 0)
          keybd_event(VK_A, 0, 0, 0)
          keybd_event(VK_A, 0, KEYEVENTF_KEYUP, 0)
          keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0)

          await new Promise(resolve => setTimeout(resolve, 50))

          // Ctrl+C (copy)
          keybd_event(VK_CONTROL, 0, 0, 0)
          keybd_event(VK_C, 0, 0, 0)
          keybd_event(VK_C, 0, KEYEVENTF_KEYUP, 0)
          keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0)
        }

        // Wait for clipboard to populate
        await new Promise(resolve => setTimeout(resolve, 50))

        const text = clipboard.readText()
        if (!text || !text.trim()) {
          console.log("[Shortcuts] Ctrl+Shift+K: clipboard empty, skipping")
          return
        }

        // Show window without stealing focus
        if (!this.appState.isVisible()) {
          mainWindow.showInactive()
        }
        mainWindow.setAlwaysOnTop(true, "screen-saver")

        // Send clipboard text to renderer for chat
        mainWindow.webContents.send("clipboard-chat", text.trim())
      } catch (error) {
        console.error("[Shortcuts] Ctrl+Shift+K error:", error)
      }
    })

    register("CommandOrControl+Shift+G", () => {
      this.appState.toggleStealthMode()
    })



    // Record shortcut
    register("CommandOrControl+Shift+O", () => {
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (!this.appState.isVisible()) {
          mainWindow.showInactive()
          mainWindow.setAlwaysOnTop(true, "screen-saver")
        }
        mainWindow.webContents.send("toggle-record")
      }
    })

    // Listen shortcut
    register("CommandOrControl+Shift+J", () => {
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (!this.appState.isVisible()) {
          mainWindow.showInactive()
          mainWindow.setAlwaysOnTop(true, "screen-saver")
        }
        mainWindow.webContents.send("toggle-listen")
      }
    })

    // Chat shortcut
    register("CommandOrControl+Shift+C", () => {
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (!this.appState.isVisible()) {
          mainWindow.showInactive()
          mainWindow.setAlwaysOnTop(true, "screen-saver")
        }
        mainWindow.webContents.send("toggle-chat")
      }
    })

    register("CommandOrControl+B", () => {
      this.appState.toggleMainWindow()
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !this.appState.isVisible()) {
        mainWindow.setAlwaysOnTop(true, "screen-saver")
      }
    })

    app.on("will-quit", () => {
      globalShortcut.unregisterAll()
    })
  }

  public reregisterShortcuts(): void {
    globalShortcut.unregisterAll()
    this.registerGlobalShortcuts()

    // Also restore the window if it was somehow hidden
    const mainWindow = this.appState.getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(true, "screen-saver")
    }
  }
}
