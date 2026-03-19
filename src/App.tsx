import { ToastProvider } from "./components/ui/toast"
import Queue from "./_pages/Queue"
import { ToastViewport } from "@radix-ui/react-toast"
import { useCallback, useEffect, useRef, useState } from "react"
import Solutions from "./_pages/Solutions"
import { QueryClient, QueryClientProvider } from "react-query"

declare global {
  interface Window {
    electronAPI: {
      //RANDOM GETTER/SETTERS
      updateContentDimensions: (dimensions: {
        width: number
        height: number
      }) => Promise<void>
      getScreenshots: () => Promise<Array<{ path: string; preview: string }>>

      //GLOBAL EVENTS
      //TODO: CHECK THAT PROCESSING NO SCREENSHOTS AND TAKE SCREENSHOTS ARE BOTH CONDITIONAL
      onUnauthorized: (callback: () => void) => () => void
      onScreenshotTaken: (
        callback: (data: { path: string; preview: string }) => void
      ) => () => void
      onProcessingNoScreenshots: (callback: () => void) => () => void
      onResetView: (callback: () => void) => () => void
      takeScreenshot: () => Promise<void>

      //INITIAL SOLUTION EVENTS
      deleteScreenshot: (
        path: string
      ) => Promise<{ success: boolean; error?: string }>
      onSolutionStart: (callback: () => void) => () => void
      onSolutionError: (callback: (error: string) => void) => () => void
      onSolutionSuccess: (callback: (data: any) => void) => () => void
      onProblemExtracted: (callback: (data: any) => void) => () => void

      onDebugSuccess: (callback: (data: any) => void) => () => void

      onDebugStart: (callback: () => void) => () => void
      onDebugError: (callback: (error: string) => void) => () => void

      // Audio Processing
      analyzeAudioFromBase64: (data: string, mimeType: string) => Promise<{ text: string; timestamp: number }>
      analyzeAudioFile: (path: string) => Promise<{ text: string; timestamp: number }>

      moveWindowLeft: () => Promise<void>
      moveWindowRight: () => Promise<void>
      moveWindowUp: () => Promise<void>
      moveWindowDown: () => Promise<void>
      quitApp: () => Promise<void>
      
      // LLM Model Management
      getCurrentLlmConfig: () => Promise<{ provider: "ollama" | "cloud"; model: string; isOllama: boolean }>
      getAvailableOllamaModels: () => Promise<string[]>
      switchToOllama: (model?: string, url?: string) => Promise<{ success: boolean; error?: string }>
      switchToCloud: (url?: string, apiKey?: string) => Promise<{ success: boolean; error?: string }>
      testLlmConnection: () => Promise<{ success: boolean; error?: string }>
      
      getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>
      setWindowBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>
      onStealthModeChanged: (callback: (enabled: boolean) => void) => () => void
      invoke: (channel: string, ...args: any[]) => Promise<any>
    }
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      cacheTime: Infinity
    }
  }
})

const App: React.FC = () => {
  const [view, setView] = useState<"queue" | "solutions" | "debug">("queue")
  const containerRef = useRef<HTMLDivElement>(null)

  // Apply saved theme synchronously before first paint
  useState(() => {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark')
    }
  })

  // Effect for height monitoring
  useEffect(() => {
    const cleanup = window.electronAPI.onResetView(() => {
      console.log("Received 'reset-view' message from main process.")
      queryClient.invalidateQueries(["screenshots"])
      queryClient.invalidateQueries(["problem_statement"])
      queryClient.invalidateQueries(["solution"])
      queryClient.invalidateQueries(["new_solution"])
      setView("queue")
    })

    return () => {
      cleanup()
    }
  }, [])

  // Size window once on view switch only — no continuous resizing
  useEffect(() => {
    if (!containerRef.current) return
    const height = containerRef.current.offsetHeight
    const width = containerRef.current.offsetWidth
    window.electronAPI?.updateContentDimensions({ width, height })
  }, [view])

  // Resize handler for frameless window edge dragging
  const handleResizeMouseDown = useCallback((e: React.MouseEvent, direction: string) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.screenX
    const startY = e.screenY
    let bounds: { x: number; y: number; width: number; height: number } | null = null

    window.electronAPI?.getWindowBounds?.().then((b: any) => {
      if (!b) return
      bounds = b

      const onMouseMove = (ev: MouseEvent) => {
        if (!bounds) return
        const dx = ev.screenX - startX
        const dy = ev.screenY - startY
        const newBounds = { ...bounds }

        if (direction.includes('s')) {
          newBounds.height = Math.max(300, bounds.height + dy)
        }
        if (direction.includes('n')) {
          newBounds.y = bounds.y + dy
          newBounds.height = Math.max(300, bounds.height - dy)
        }
        if (direction.includes('e')) {
          newBounds.width = Math.max(300, bounds.width + dx)
        }
        if (direction.includes('w')) {
          newBounds.x = bounds.x + dx
          newBounds.width = Math.max(300, bounds.width - dx)
        }

        window.electronAPI?.setWindowBounds?.(newBounds)
      }

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    })
  }, [])

  useEffect(() => {
    const cleanupFunctions = [
      window.electronAPI.onSolutionStart(() => {
        setView("solutions")
        console.log("starting processing")
      }),

      window.electronAPI.onUnauthorized(() => {
        queryClient.removeQueries(["screenshots"])
        queryClient.removeQueries(["solution"])
        queryClient.removeQueries(["problem_statement"])
        setView("queue")
        console.log("Unauthorized")
      }),
      // Update this reset handler
      window.electronAPI.onResetView(() => {
        console.log("Received 'reset-view' message from main process")

        queryClient.removeQueries(["screenshots"])
        queryClient.removeQueries(["solution"])
        queryClient.removeQueries(["problem_statement"])
        setView("queue")
        console.log("View reset to 'queue' via Command+R shortcut")
      }),
      window.electronAPI.onProblemExtracted((data: any) => {
        if (view === "queue") {
          console.log("Problem extracted successfully")
          queryClient.invalidateQueries(["problem_statement"])
          queryClient.setQueryData(["problem_statement"], data)
        }
      })
    ]
    return () => cleanupFunctions.forEach((cleanup) => cleanup())
  }, [])

  return (
    <div ref={containerRef} className="min-h-0 relative h-screen flex flex-col">
      {/* Resize handles for frameless window */}
      <div className="resize-handle resize-n" onMouseDown={e => handleResizeMouseDown(e, 'n')} />
      <div className="resize-handle resize-s" onMouseDown={e => handleResizeMouseDown(e, 's')} />
      <div className="resize-handle resize-e" onMouseDown={e => handleResizeMouseDown(e, 'e')} />
      <div className="resize-handle resize-w" onMouseDown={e => handleResizeMouseDown(e, 'w')} />
      <div className="resize-handle resize-ne" onMouseDown={e => handleResizeMouseDown(e, 'ne')} />
      <div className="resize-handle resize-nw" onMouseDown={e => handleResizeMouseDown(e, 'nw')} />
      <div className="resize-handle resize-se" onMouseDown={e => handleResizeMouseDown(e, 'se')} />
      <div className="resize-handle resize-sw" onMouseDown={e => handleResizeMouseDown(e, 'sw')} />

      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          {view === "queue" ? (
            <Queue setView={setView} />
          ) : view === "solutions" ? (
            <Solutions setView={setView} />
          ) : (
            <></>
          )}
          <ToastViewport />
        </ToastProvider>
      </QueryClientProvider>
    </div>
  )
}

export default App
