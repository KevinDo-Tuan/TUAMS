import { globalShortcut, app, BrowserWindow, clipboard } from "electron"
import { execSync } from "child_process"
import * as path from "path"
import { AppState } from "./main"

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

    register("CommandOrControl+Shift+K", async () => {
      const mainWindow = this.appState.getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed()) return

      try {
        // Simulate Ctrl+A then Ctrl+C on the foreground window (e.g. Azota)
        const psExe = path.join(
          process.env.SystemRoot || "C:\\Windows",
          "System32", "WindowsPowerShell", "v1.0", "powershell.exe"
        )
        execSync(
          `"${psExe}" -NoProfile -NonInteractive -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^a'); Start-Sleep -Milliseconds 150; [System.Windows.Forms.SendKeys]::SendWait('^c')"`,
          { windowsHide: true, timeout: 5000 }
        )

        // Wait for clipboard to populate
        await new Promise(resolve => setTimeout(resolve, 200))

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
