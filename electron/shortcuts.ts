import { globalShortcut, app, BrowserWindow } from "electron"
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
