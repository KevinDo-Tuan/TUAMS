interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  getScreenshots: () => Promise<Array<{ path: string; preview: string }>>
  deleteScreenshot: (path: string) => Promise<{ success: boolean; error?: string }>
  onScreenshotTaken: (callback: (data: { path: string; preview: string }) => void) => () => void
  onSolutionsReady: (callback: (solutions: string) => void) => () => void
  onResetView: (callback: () => void) => () => void
  onSolutionStart: (callback: () => void) => () => void
  onDebugStart: (callback: () => void) => () => void
  onDebugSuccess: (callback: (data: any) => void) => () => void
  onSolutionError: (callback: (error: string) => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: any) => void) => () => void
  onSolutionSuccess: (callback: (data: any) => void) => () => void
  onUnauthorized: (callback: () => void) => () => void
  onFocusChat: (callback: () => void) => () => void
  onClipboardChat: (callback: (text: string) => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  takeScreenshot: () => Promise<void>
  moveWindowLeft: () => Promise<void>
  moveWindowRight: () => Promise<void>
  moveWindowUp: () => Promise<void>
  moveWindowDown: () => Promise<void>
  analyzeAudioFromBase64: (data: string, mimeType: string) => Promise<{ text: string; timestamp: number }>
  analyzeAudioFile: (path: string) => Promise<{ text: string; timestamp: number }>
  analyzeImageFile: (path: string) => Promise<void>
  quitApp: () => Promise<void>
  setWindowFocusable: (focusable: boolean) => Promise<void>

  // LLM Model Management
  getCurrentLlmConfig: () => Promise<{ provider: "ollama" | "cloud"; model: string; isOllama: boolean }>
  getAvailableOllamaModels: () => Promise<string[]>
  switchToOllama: (model?: string, url?: string) => Promise<{ success: boolean; error?: string }>
  switchToCloud: (model?: string) => Promise<{ success: boolean; error?: string }>
  testLlmConnection: () => Promise<{ success: boolean; error?: string }>

  // System audio capture
  getDesktopSources: () => Promise<Array<{ id: string; name: string; thumbnail: string }>>
  transcribeAudio: (audioBase64: string) => Promise<{ success: boolean; text?: string; error?: string }>
  chatWithVision: (message: string, images: string[]) => Promise<string>
  openPdfDialog: () => Promise<{ fileName: string; pageCount: number; text: string; images: string[] } | { error: string } | null>

  onAiStreamToken: (callback: (text: string) => void) => () => void
  invoke: (channel: string, ...args: any[]) => Promise<any>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
} 