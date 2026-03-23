import React, { useState, useEffect, useRef } from "react"
import { useQuery } from "react-query"
import ScreenshotQueue from "../components/Queue/ScreenshotQueue"
import {
  Toast,
  ToastTitle,
  ToastDescription,
  ToastVariant,
  ToastMessage
} from "../components/ui/toast"
import QueueCommands from "../components/Queue/QueueCommands"
import MarkdownMessage from "../components/Chat/MarkdownMessage"

const THINKING_WORDS = [
  "Cooking up", "Locking in", "On it", "Lowkey grinding",
  "Pulling up", "Tapping in", "Running it", "Dialing in",
  "Mapping it out", "Building out", "Crunching", "Scanning",
  "Linking up", "Loading up", "Firing up", "Piecing together"
]

interface QueueProps {
  setView: React.Dispatch<React.SetStateAction<"queue" | "solutions" | "debug">>
}

const Queue: React.FC<QueueProps> = ({ setView }) => {
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<ToastMessage>({
    title: "",
    description: "",
    variant: "neutral"
  })

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)

  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState<{role: "user"|"ai", text: string, attachment?: { type: string, fileName?: string }}[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [pendingAttachment, setPendingAttachment] = useState<{ transcript: string; frames: string[]; type?: 'recording' | 'screenshot' | 'pdf'; fileName?: string } | null>(null)

  const [isListening, setIsListening] = useState(false)
  const originalBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)

  // Help mode state
  const [isHelpMode, setIsHelpMode] = useState(false)
  const preHelpStateRef = useRef<{ isChatOpen: boolean; bounds: { x: number; y: number; width: number; height: number } | null }>({ isChatOpen: false, bounds: null })

  const [currentModel, setCurrentModel] = useState<{ provider: string; model: string }>({ provider: "cloud", model: "glm-5:cloud" })
  const [allModels, setAllModels] = useState<string[]>([])
  const [thinkingWord, setThinkingWord] = useState("")
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false)
  const modelPickerRef = useRef<HTMLDivElement>(null)

  const barRef = useRef<HTMLDivElement>(null)

  // Session memory — accumulates transcript + AI responses across the meeting
  const sessionMemoryRef = useRef<string[]>([])
  const autoScreenshotsRef = useRef<string[]>([]) // auto-captured screenshots (record mode)

  const addToSessionMemory = (entry: string) => {
    sessionMemoryRef.current.push(entry)
    // Keep last 20 entries to avoid token overflow
    if (sessionMemoryRef.current.length > 20) {
      sessionMemoryRef.current = sessionMemoryRef.current.slice(-20)
    }
  }

  const getSessionContext = (): string => {
    if (sessionMemoryRef.current.length === 0) return ""
    return sessionMemoryRef.current.join("\n---\n")
  }

  // Resize window when both listen and chat are active
  useEffect(() => {
    const bothActive = isListening && isChatOpen
    if (bothActive) {
      // Save original bounds and double height
      window.electronAPI.getWindowBounds().then(bounds => {
        if (bounds && !originalBoundsRef.current) {
          originalBoundsRef.current = bounds
          window.electronAPI.setWindowBounds({
            x: bounds.x,
            y: Math.max(0, bounds.y - bounds.height),
            width: bounds.width,
            height: bounds.height * 2,
          })
        }
      })
    } else if (originalBoundsRef.current) {
      // Restore original bounds
      const ob = originalBoundsRef.current
      originalBoundsRef.current = null
      window.electronAPI.setWindowBounds(ob)
    }
  }, [isListening, isChatOpen])

  const { data: screenshots = [], refetch } = useQuery<Array<{ path: string; preview: string }>, Error>(
    ["screenshots"],
    async () => {
      try {
        const existing = await window.electronAPI.getScreenshots()
        return existing
      } catch (error) {
        console.error("Error loading screenshots:", error)
        showToast("Error", "Failed to load existing screenshots", "error")
        return []
      }
    },
    {
      staleTime: Infinity,
      cacheTime: Infinity,
      refetchOnWindowFocus: true,
      refetchOnMount: true
    }
  )

  const showToast = (
    title: string,
    description: string,
    variant: ToastVariant
  ) => {
    setToastMessage({ title, description, variant })
    setToastOpen(true)
  }

  const handleDeleteScreenshot = async (index: number) => {
    const screenshotToDelete = screenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        refetch()
      } else {
        console.error("Failed to delete screenshot:", response.error)
        showToast("Error", "Failed to delete the screenshot file", "error")
      }
    } catch (error) {
      console.error("Error deleting screenshot:", error)
    }
  }

  const handleChatSend = async () => {
    const attachment = pendingAttachment
    const userText = chatInput.trim()

    if (!userText && !attachment) return

    setChatMessages((msgs) => [...msgs, {
      role: "user" as const,
      text: userText || "...",
      ...(attachment ? { attachment: { type: String(attachment.type), fileName: attachment.fileName } } : {})
    }])
    setChatLoading(true)
    setChatInput("")
    setPendingAttachment(null)

    try {
      let response: string
      const sessionCtx = getSessionContext()
      const contextPrefix = sessionCtx ? `[Session context]\n${sessionCtx}\n\n[Current message]\n` : ""

      if (attachment) {
        let prompt: string
        if (attachment.type === 'pdf') {
          const textContext = attachment.transcript ? attachment.transcript.slice(0, 8000) : ''
          prompt = userText
            ? `${contextPrefix}${userText}\n\nThe user attached a PDF "${attachment.fileName}". Extracted text:\n"${textContext}"\n\nThe attached images are rendered pages from the PDF.`
            : `${contextPrefix}The user attached a PDF "${attachment.fileName}". Extracted text:\n"${textContext}"\n\nThe attached images are rendered pages. Analyze the content and provide a helpful response.`
        } else {
          prompt = userText
            ? `${contextPrefix}${userText}\n\nAudio transcript from recording:\n"${attachment.transcript}"\n\nThe attached images are frames captured from the screen during recording.`
            : `${contextPrefix}The user recorded their screen while speaking. Audio transcript:\n"${attachment.transcript}"\n\nThe attached images are frames from the screen recording. Analyze what is shown and provide a helpful response.`
        }
        // Include auto-captured screenshots as additional context
        const allFrames = [...attachment.frames, ...autoScreenshotsRef.current.slice(-3)]
        response = await (window.electronAPI as any).chatWithVision(prompt, allFrames)
      } else {
        response = await window.electronAPI.invoke("ai-chat", contextPrefix + userText)
      }
      setChatMessages((msgs) => [...msgs, { role: "ai", text: response }])
      addToSessionMemory(`User: ${userText}\nAI: ${response.slice(0, 300)}`)
    } catch (err) {
      setChatMessages((msgs) => [...msgs, { role: "ai", text: "Error: " + String(err) }])
    } finally {
      setChatLoading(false)
      chatInputRef.current?.focus()
    }
  }


  // Cycle thinking words while loading
  useEffect(() => {
    if (!chatLoading) return
    const pick = () => THINKING_WORDS[Math.floor(Math.random() * THINKING_WORDS.length)]
    setThinkingWord(pick())
    const interval = setInterval(() => setThinkingWord(pick()), 2000)
    return () => clearInterval(interval)
  }, [chatLoading])

  // Load current model config and available models on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [config, models] = await Promise.all([
          window.electronAPI.getCurrentLlmConfig(),
          window.electronAPI.getAvailableOllamaModels(),
        ])
        setCurrentModel({ provider: config.provider, model: config.model })
        setAllModels(models)
      } catch (error) {
        console.error('Error loading model config:', error)
      }
    }
    load()
  }, []);

  useEffect(() => {
    const cleanupFunctions = [
      (window.electronAPI as any).onFocusChat(() => {
        setIsChatOpen(true)
        setTimeout(() => chatInputRef.current?.focus(), 50)
      }),
      (window.electronAPI as any).onClipboardChat(async (text: string) => {
        setIsChatOpen(true)
        setChatMessages(msgs => [...msgs, { role: "user", text }])
        setChatLoading(true)
        try {
          const sessionCtx = getSessionContext()
          const prompt = sessionCtx ? `[Session context]\n${sessionCtx}\n\n[Current message]\n${text}` : text
          const response = await window.electronAPI.invoke("ai-chat", prompt)
          setChatMessages(msgs => [...msgs, { role: "ai", text: response }])
          addToSessionMemory(`User: ${text.slice(0, 200)}\nAI: ${response.slice(0, 300)}`)
        } catch (err) {
          setChatMessages(msgs => [...msgs, { role: "ai", text: "Error: " + String(err) }])
        } finally {
          setChatLoading(false)
        }
      }),
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => refetch()),
      window.electronAPI.onSolutionError((error: string) => {
        showToast(
          "Processing Failed",
          "There was an error processing your screenshots.",
          "error"
        )
        setView("queue")
        console.error("Processing error:", error)
      }),
      window.electronAPI.onProcessingNoScreenshots(() => {
        showToast(
          "No Screenshots",
          "There are no screenshots to process.",
          "neutral"
        )
      })
    ]

    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [])

  // Stealth mode toggle notification
  useEffect(() => {
    const unsubscribe = window.electronAPI.onStealthModeChanged((enabled: boolean) => {
      if (enabled) {
        document.documentElement.classList.add('stealth')
      } else {
        document.documentElement.classList.remove('stealth')
      }
      showToast(
        enabled ? "Stealth ON" : "Stealth OFF",
        enabled ? "Hidden from screen share (Ctrl+Shift+G to toggle)" : "Transparent background restored",
        enabled ? "success" : "neutral"
      )
    })
    return () => unsubscribe()
  }, [])

  // Screenshot → attach to chat for review before sending
  useEffect(() => {
    const unsubscribe = window.electronAPI.onScreenshotTaken(async (data) => {
      await refetch();
      if (data?.preview) {
        const base64 = data.preview.replace(/^data:image\/\w+;base64,/, '')
        setPendingAttachment({ transcript: '', frames: [base64], type: 'screenshot' })
        setIsChatOpen(true)
        setTimeout(() => chatInputRef.current?.focus(), 50)
      }
    });
    return () => {
      unsubscribe && unsubscribe();
    };
  }, [refetch]);

  // Close model picker on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setIsModelPickerOpen(false)
      }
    }
    if (isModelPickerOpen) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [isModelPickerOpen])

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  const handleChatToggle = () => {
    setIsChatOpen(!isChatOpen)
  }

  const handleHelpToggle = async (active: boolean) => {
    if (active) {
      // Save current state
      const bounds = await window.electronAPI.getWindowBounds()
      preHelpStateRef.current = { isChatOpen, bounds }
      // Close chat
      setIsChatOpen(false)
      setIsHelpMode(true)
      // Resize window to compact size for shortcuts
      if (bounds) {
        window.electronAPI.setWindowBounds({
          x: bounds.x,
          y: bounds.y,
          width: Math.max(bounds.width, 400),
          height: 420,
        })
      }
    } else {
      // Restore previous state
      setIsHelpMode(false)
      const saved = preHelpStateRef.current
      if (saved.isChatOpen) setIsChatOpen(true)
      if (saved.bounds) {
        window.electronAPI.setWindowBounds(saved.bounds)
      }
      preHelpStateRef.current = { isChatOpen: false, bounds: null }
    }
  }

  const handleVoiceMessage = async (text: string, prompt?: string) => {
    // Open chat and send the transcribed voice message to AI
    setIsChatOpen(true)
    const displayText = prompt
      ? `[Voice] ${prompt}\n\nTranscript: "${text}"`
      : `[Voice] ${text}`
    const sessionCtx = getSessionContext()
    const contextPrefix = sessionCtx ? `[Session context]\n${sessionCtx}\n\n` : ""
    const aiPrompt = prompt
      ? `${contextPrefix}${prompt}\n\nHere is the transcript of the conversation:\n"${text}"`
      : `${contextPrefix}${text}`

    // Add transcript to session memory
    addToSessionMemory(`[Transcript] ${text.slice(0, 500)}`)

    setChatMessages(msgs => [...msgs, { role: "user", text: displayText }])
    setChatLoading(true)
    try {
      const response = await window.electronAPI.invoke("ai-chat", aiPrompt)
      setChatMessages(msgs => [...msgs, { role: "ai", text: response }])
      addToSessionMemory(`AI response: ${response.slice(0, 300)}`)
    } catch (err) {
      setChatMessages(msgs => [...msgs, { role: "ai", text: "Error: " + String(err) }])
    } finally {
      setChatLoading(false)
    }
  }

  const handleScreenRecordingMessage = (transcript: string, frames: string[]) => {
    setIsChatOpen(true)
    setPendingAttachment({ transcript, frames, type: 'recording' })
    setTimeout(() => chatInputRef.current?.focus(), 50)
  }

  const handleAttachPdf = async () => {
    const result = await (window.electronAPI as any).openPdfDialog()
    if (!result) return
    if ('error' in result) {
      setChatMessages(msgs => [...msgs, { role: "ai", text: `Error: ${result.error}` }])
      return
    }
    setPendingAttachment({
      transcript: result.text,
      frames: result.images,
      type: 'pdf',
      fileName: result.fileName,
    })
    setIsChatOpen(true)
    setTimeout(() => chatInputRef.current?.focus(), 50)
  }

  const handleModelSwitch = async (model: string) => {
    const isCloud = model.endsWith(':cloud')
    try {
      if (isCloud) {
        await window.electronAPI.switchToCloud(model)
      } else {
        await window.electronAPI.switchToOllama(model)
      }
      setCurrentModel({ provider: isCloud ? 'cloud' : 'ollama', model })
    } catch (err) {
      console.error('Error switching model:', err)
    }
  }


  return (
    <div
      ref={barRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        pointerEvents: "auto"
      }}
      className="select-none flex flex-col"
    >
      <div className="bg-transparent w-full h-full flex flex-col">
        <div className="px-1.5 py-1 flex-1 flex flex-col min-h-0">
          <Toast
            open={toastOpen}
            onOpenChange={setToastOpen}
            variant={toastMessage.variant}
            duration={3000}
          >
            <ToastTitle>{toastMessage.title}</ToastTitle>
            <ToastDescription>{toastMessage.description}</ToastDescription>
          </Toast>
          {/* Action bar at top (centered) */}
          <div className="flex justify-center mb-1">
            <div id="action-bar-top" />
          </div>
          {/* QueueCommands (hidden container - renders via portals) */}
          <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
            <QueueCommands
              screenshots={screenshots}
              onTooltipVisibilityChange={handleTooltipVisibilityChange}
              onChatToggle={handleChatToggle}
              onVoiceMessage={handleVoiceMessage}
              onScreenRecordingMessage={handleScreenRecordingMessage}
              actionBarPortalId="action-bar-top"
              shortcutsBarPortalId="shortcuts-bar-bottom"
              meetingContext={getSessionContext()}
              onAutoScreenshot={(base64) => {
                autoScreenshotsRef.current.push(base64)
                // Keep only last 5 auto-screenshots
                if (autoScreenshotsRef.current.length > 5) {
                  autoScreenshotsRef.current = autoScreenshotsRef.current.slice(-5)
                }
              }}
              onLiveAiUpdate={(suggestion) => {
                addToSessionMemory(`[Live AI] ${suggestion.slice(0, 200)}`)
              }}
              onListenStateChange={(listening) => {
                setIsListening(listening)
              }}
              onHelpToggle={handleHelpToggle}
              isHelpMode={isHelpMode}
            />
          </div>
          {/* Help Mode — Keyboard Shortcuts Panel */}
          {isHelpMode && (
            <div className="mt-2 w-full mx-auto liquid-glass chat-container aura-strong p-0 flex flex-col overflow-hidden flex-1 min-h-0 animate-fade-in">
              <div className="vortex-watermark" />
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <h3 className="font-semibold text-[hsl(0,0%,10%)] dark:text-[hsl(0,0%,90%)] mb-3 text-[14px]">Keyboard Shortcuts</h3>
                <div className="space-y-2.5">
                  {[
                    { label: 'Toggle Window', keys: ['Ctrl', 'B'], desc: 'Show or hide this window' },
                    { label: 'Stealth', keys: ['Ctrl', 'Shift', 'G'], desc: 'Hide from screen share' },
                    { label: 'Screenshot', keys: ['Ctrl', 'Shift', 'H'], desc: 'Capture current screen' },
                    { label: 'Solve', keys: ['Ctrl', 'Shift', 'Enter'], desc: 'Generate solution from screenshots' },
                    { label: 'Record', keys: ['Ctrl', 'Shift', 'O'], desc: 'Record screen + mic' },
                    { label: 'Listen', keys: ['Ctrl', 'Shift', 'J'], desc: 'Listen & transcribe audio' },
                    { label: 'Chat', keys: ['Ctrl', 'Shift', 'C'], desc: 'Toggle chat window' },
                    { label: 'Reset', keys: ['Ctrl', 'Shift', 'R'], desc: 'Clear all screenshots & reset' },
                    { label: 'Copy & Ask AI', keys: ['Ctrl', 'Shift', 'K'], desc: 'Copy page text & send to AI' },
                    { label: 'Center Window', keys: ['Ctrl', 'Shift', 'Space'], desc: 'Center and show window' },
                    { label: 'Move Window', keys: ['Ctrl', 'Shift', 'Arrows'], desc: 'Reposition the window' },
                    { label: 'Resize Window', keys: ['Ctrl', 'Alt', 'Arrows'], desc: 'Grow or shrink the window' },
                  ].map(({ label, keys, desc }) => (
                    <div key={label} className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-[12px] text-[hsl(0,0%,10%)] dark:text-[hsl(0,0%,90%)]">{label}</div>
                        <div className="text-[10px] text-[hsl(0,0%,40%)] dark:text-[hsl(0,0%,60%)] mt-0.5">{desc}</div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 mt-0.5">
                        {keys.map((k) => (
                          <span key={k} className="kbd-key">{k}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {/* Chat Interface */}
          {isChatOpen && !isHelpMode && (
            <div className="mt-2 w-full mx-auto liquid-glass chat-container aura-strong p-0 flex flex-col overflow-hidden flex-1 min-h-0">
              <div className="vortex-watermark" />
              {/* Messages Area */}
              <div className="flex-1 min-h-0 overflow-y-auto mb-2 px-3 py-2">
                {chatMessages.length === 0 ? (
                  <div className="flex items-center justify-center h-full animate-fade-in">
                    <div className="text-[14px] text-[hsla(210,25%,15%,0.45)] dark:text-[hsla(0,0%,80%,0.45)] font-medium">
                      Ask your personal assistant
                    </div>
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`w-full flex ${msg.role === "user" ? "justify-end" : "justify-start"} mb-2 animate-fade-in`}
                    >
                      <div className={`max-w-[85%] ${msg.role === "user" ? "ml-6" : "mr-6"} flex flex-col items-${msg.role === "user" ? "end" : "start"} gap-1`}>
                        {msg.role === "user" && msg.attachment && (
                          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-[hsla(215,25%,15%,0.8)] border border-[hsla(0,0%,0%,0.08)] dark:border-[hsla(200,40%,60%,0.15)]">
                            <div className="w-6 h-6 rounded-md bg-red-500 flex items-center justify-center flex-shrink-0">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                              </svg>
                            </div>
                            <div className="min-w-0">
                              <div className="text-[11px] font-medium text-[hsl(0,0%,10%)] dark:text-[hsl(0,0%,90%)] truncate max-w-[180px]">
                                {msg.attachment.fileName || 'File'}
                              </div>
                              <div className="text-[9px] text-[hsl(0,0%,45%)] dark:text-[hsl(0,0%,55%)]">
                                {msg.attachment.type === 'pdf' ? 'PDF' : msg.attachment.type === 'screenshot' ? 'Screenshot' : 'Recording'}
                              </div>
                            </div>
                          </div>
                        )}
                        <div
                          className={`px-3.5 py-2.5 text-[14px] leading-relaxed ${
                            msg.role === "user"
                              ? "chat-bubble-user"
                              : "chat-bubble-ai"
                          }`}
                          style={{ wordBreak: "break-word" }}
                        >
                          {msg.role === "ai" ? <MarkdownMessage content={msg.text} /> : msg.text}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {chatLoading && (
                  <div className="flex justify-start mb-2 animate-fade-in">
                    <div className="chat-bubble-ai px-3.5 py-2.5 mr-6">
                      <span className="inline-flex items-center gap-2.5">
                        <span className="inline-flex items-center gap-1">
                          <span className="loading-dot w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                          <span className="loading-dot w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                          <span className="loading-dot w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                        </span>
                        <span className="text-[12px] text-[hsl(0,0%,35%)] dark:text-[hsl(0,0%,65%)] font-medium tracking-wide animate-thinking-word">
                          {thinkingWord}...
                        </span>
                      </span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              {/* Input Area */}
              <div className="relative px-3 pb-3">
                {/* Attachment preview floating above input */}
                {pendingAttachment && (
                  <div className="absolute bottom-full right-0 mb-1 z-10 animate-fade-in">
                    <div className="liquid-glass-dark px-2.5 py-1.5 flex items-center gap-2 text-[11px] rounded-lg max-w-[200px]">
                      <span className="cmd-label font-medium truncate">
                        {pendingAttachment.type === 'pdf' ? `📄 ${pendingAttachment.fileName}` :
                         pendingAttachment.type === 'screenshot' ? '📸 Screenshot' :
                         '🎙 Recording'}
                      </span>
                      <button
                        type="button"
                        className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0 text-[10px]"
                        onClick={() => setPendingAttachment(null)}
                        title="Remove attachment"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              <form className="flex gap-1.5 items-center glass-content" onSubmit={e => { e.preventDefault(); handleChatSend(); }}>
                <input
                  ref={chatInputRef}
                  className="glass-input flex-1 px-3 py-2.5 text-[13px]"
                  placeholder={pendingAttachment ? "Add a message or press Enter..." : "Ask anything..."}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && !chatLoading && (chatInput.trim() || pendingAttachment)) {
                      e.preventDefault()
                      handleChatSend()
                    }
                  }}
                  disabled={chatLoading}
                />
                {/* Model picker */}
                <div className="relative" ref={modelPickerRef}>
                  <button
                    type="button"
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/6 hover:bg-white/12 border border-white/8 hover:border-white/15 transition-all duration-200 cursor-pointer group"
                    onClick={() => setIsModelPickerOpen(!isModelPickerOpen)}
                    disabled={chatLoading}
                  >
                    <span className="text-[10px] font-medium tracking-wide text-[hsl(0,0%,25%)] dark:text-[hsl(0,0%,75%)] group-hover:text-[hsl(0,0%,10%)] dark:group-hover:text-white transition-colors">
                      Model
                    </span>
                    <svg className={`w-2.5 h-2.5 text-[hsl(0,0%,40%)] transition-transform duration-200 ${isModelPickerOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {isModelPickerOpen && (
                    <div className="absolute bottom-full right-0 mb-1.5 z-50 animate-fade-in">
                      <div className="liquid-glass-dark rounded-xl p-1 min-w-[140px] max-h-[200px] overflow-y-auto shadow-xl border border-white/10">
                        {allModels.map(m => (
                          <button
                            key={m}
                            type="button"
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-all duration-150 flex items-center gap-2 ${
                              currentModel.model === m
                                ? 'bg-white/15 text-[hsl(0,0%,8%)] dark:text-white font-medium'
                                : 'text-[hsl(0,0%,30%)] dark:text-[hsl(0,0%,70%)] hover:bg-white/8 hover:text-[hsl(0,0%,10%)] dark:hover:text-white'
                            }`}
                            onClick={() => { handleModelSwitch(m); setIsModelPickerOpen(false) }}
                          >
                            {m.includes(':cloud') && (
                              <span className="text-[9px] opacity-60">&#9729;</span>
                            )}
                            <span className="truncate">{m.replace(':cloud', '').replace(':', '/')}</span>
                            {currentModel.model === m && (
                              <svg className="w-3 h-3 ml-auto flex-shrink-0 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {/* Attach */}
                <button
                  type="button"
                  onClick={handleAttachPdf}
                  className="w-7 h-7 rounded-lg bg-white/6 hover:bg-white/12 border border-white/8 hover:border-white/15 transition-all duration-200 flex items-center justify-center group"
                  disabled={chatLoading}
                  title="Attach PDF"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 text-[hsl(0,0%,35%)] group-hover:text-[hsl(0,0%,10%)] dark:text-[hsl(0,0%,65%)] dark:group-hover:text-white transition-colors">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
                {/* Send */}
                <button
                  type="submit"
                  className="dawn-btn group relative p-2 rounded-lg flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                  disabled={chatLoading || (!chatInput.trim() && !pendingAttachment)}
                  tabIndex={-1}
                  aria-label="Send"
                >
                  <svg className="vortex-send w-4 h-4" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
                    <g transform="translate(256,256)">
                      <path d="M 0,-180 C 80,-170 160,-100 170,-20 C 180,60 120,130 40,150 C -40,170 -110,120 -130,50 C -150,-20 -100,-80 -40,-90 C 20,-100 60,-60 60,-10 C 60,30 30,50 0,50" fill="none" stroke="currentColor" strokeWidth="32" strokeLinecap="round"/>
                      <path d="M 0,180 C -80,170 -160,100 -170,20 C -180,-60 -120,-130 -40,-150 C 40,-170 110,-120 130,-50 C 150,20 100,80 40,90 C -20,100 -60,60 -60,10 C -60,-30 -30,-50 0,-50" fill="none" stroke="currentColor" strokeWidth="32" strokeLinecap="round"/>
                      <path d="M -180,0 C -170,-80 -100,-160 -20,-170 C 60,-180 130,-120 150,-40 C 170,40 120,110 50,130 C -20,150 -80,100 -90,40 C -100,-20 -60,-60 -10,-60 C 30,-60 50,-30 50,0" fill="none" stroke="currentColor" strokeWidth="26" strokeLinecap="round"/>
                      <path d="M 180,0 C 170,80 100,160 20,170 C -60,180 -130,120 -150,40 C -170,-40 -120,-110 -50,-130 C 20,-150 80,-100 90,-40 C 100,20 60,60 10,60 C -30,60 -50,30 -50,0" fill="none" stroke="currentColor" strokeWidth="26" strokeLinecap="round"/>
                      <circle cx="0" cy="0" r="38" fill="currentColor"/>
                    </g>
                  </svg>
                  <span className="dawn-tooltip">Send</span>
                </button>
              </form>
              </div>
            </div>
          )}
        </div>
        {/* Bottom shortcuts bar portal target */}
        <div className="px-2 pb-1 flex flex-col items-center">
          <div id="shortcuts-bar-bottom" />
        </div>
      </div>
    </div>
  )
}

export default Queue
