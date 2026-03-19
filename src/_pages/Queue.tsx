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

  const [currentModel, setCurrentModel] = useState<{ provider: string; model: string }>({ provider: "cloud", model: "glm-5:cloud" })
  const [allModels, setAllModels] = useState<string[]>([])
  const [thinkingWord, setThinkingWord] = useState("")

  const barRef = useRef<HTMLDivElement>(null)

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
      role: "user",
      text: userText || "...",
      ...(attachment ? { attachment: { type: attachment.type, fileName: attachment.fileName } } : {})
    }])
    setChatLoading(true)
    setChatInput("")
    setPendingAttachment(null)

    try {
      let response: string
      if (attachment) {
        let prompt: string
        if (attachment.type === 'pdf') {
          const textContext = attachment.transcript ? attachment.transcript.slice(0, 8000) : ''
          prompt = userText
            ? `${userText}\n\nThe user attached a PDF "${attachment.fileName}". Extracted text:\n"${textContext}"\n\nThe attached images are rendered pages from the PDF.`
            : `The user attached a PDF "${attachment.fileName}". Extracted text:\n"${textContext}"\n\nThe attached images are rendered pages. Analyze the content and provide a helpful response.`
        } else {
          prompt = userText
            ? `${userText}\n\nAudio transcript from recording:\n"${attachment.transcript}"\n\nThe attached images are frames captured from the screen during recording.`
            : `The user recorded their screen while speaking. Audio transcript:\n"${attachment.transcript}"\n\nThe attached images are frames from the screen recording. Analyze what is shown and provide a helpful response.`
        }
        response = await (window.electronAPI as any).chatWithVision(prompt, attachment.frames)
      } else {
        response = await window.electronAPI.invoke("ai-chat", userText)
      }
      setChatMessages((msgs) => [...msgs, { role: "ai", text: response }])
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
          const response = await window.electronAPI.invoke("ai-chat", text)
          setChatMessages(msgs => [...msgs, { role: "ai", text: response }])
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

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  const handleChatToggle = () => {
    setIsChatOpen(!isChatOpen)
  }

  const handleVoiceMessage = async (text: string) => {
    // Open chat and send the transcribed voice message to AI
    setIsChatOpen(true)
    setChatMessages(msgs => [...msgs, { role: "user", text: `[Voice] ${text}` }])
    setChatLoading(true)
    try {
      const response = await window.electronAPI.invoke("ai-chat", text)
      setChatMessages(msgs => [...msgs, { role: "ai", text: response }])
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
        <div className="px-2 py-1.5 flex-1 flex flex-col min-h-0">
          <Toast
            open={toastOpen}
            onOpenChange={setToastOpen}
            variant={toastMessage.variant}
            duration={3000}
          >
            <ToastTitle>{toastMessage.title}</ToastTitle>
            <ToastDescription>{toastMessage.description}</ToastDescription>
          </Toast>
          <div className="w-fit">
            <QueueCommands
              screenshots={screenshots}
              onTooltipVisibilityChange={handleTooltipVisibilityChange}
              onChatToggle={handleChatToggle}
              onVoiceMessage={handleVoiceMessage}
              onScreenRecordingMessage={handleScreenRecordingMessage}
            />
          </div>
          {/* Chat Interface */}
          {isChatOpen && (
            <div className="mt-3 w-full mx-auto liquid-glass chat-container aura-strong p-4 flex flex-col overflow-hidden flex-1 min-h-0">
              <div className="vortex-watermark" />
              {/* Messages Area */}
              <div className="flex-1 min-h-0 overflow-y-auto mb-3 p-3">
                {chatMessages.length === 0 ? (
                  <div className="text-center mt-6 space-y-2 animate-fade-in">
                    <div className="text-sm text-[hsla(210,25%,15%,0.6)] font-medium tracking-tight">
                      {currentModel.model}
                    </div>
                    <div className="text-[11px] text-[hsla(210,20%,25%,0.35)]">
                       Select model below
                    </div>
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`w-full flex ${msg.role === "user" ? "justify-end" : "justify-start"} mb-2.5 animate-fade-in`}
                    >
                      <div className={`max-w-[80%] ${msg.role === "user" ? "ml-8" : "mr-8"} flex flex-col items-${msg.role === "user" ? "end" : "start"} gap-1.5`}>
                        {msg.role === "user" && msg.attachment && (
                          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/80 dark:bg-[hsla(215,25%,15%,0.8)] border border-[hsla(0,0%,0%,0.08)] dark:border-[hsla(200,40%,60%,0.15)]">
                            <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center flex-shrink-0">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                              </svg>
                            </div>
                            <div className="min-w-0">
                              <div className="text-[11.5px] font-medium text-[hsl(0,0%,10%)] dark:text-[hsl(0,0%,90%)] truncate max-w-[200px]">
                                {msg.attachment.fileName || 'File'}
                              </div>
                              <div className="text-[10px] text-[hsl(0,0%,45%)] dark:text-[hsl(0,0%,55%)]">
                                {msg.attachment.type === 'pdf' ? 'PDF' : msg.attachment.type === 'screenshot' ? 'Screenshot' : 'Recording'}
                              </div>
                            </div>
                          </div>
                        )}
                        <div
                          className={`px-3.5 py-2.5 text-[12.5px] leading-relaxed ${
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
                    <div className="chat-bubble-ai px-4 py-3 mr-8">
                      <span className="inline-flex items-center gap-2">
                        <span className="sun-pop">&#9728;</span>
                        <span className="cmd-label text-[11px] text-[hsl(0,0%,8%)] font-medium tracking-wide animate-thinking-word">
                          {thinkingWord}...
                        </span>
                      </span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              {/* Input Area */}
              <div className="relative">
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
              <form className="flex gap-2 items-center glass-content" onSubmit={e => { e.preventDefault(); handleChatSend(); }}>
                <input
                  ref={chatInputRef}
                  className="glass-input flex-1 px-3.5 py-2.5 text-xs"
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
                <select
                  className="glass-input px-1.5 py-2.5 text-[10px] max-w-[100px] text-center truncate appearance-none cursor-pointer"
                  value={currentModel.model}
                  onChange={e => handleModelSwitch(e.target.value)}
                  disabled={chatLoading}
                >
                  {allModels.map(m => <option key={m} value={m}>{m.replace(':cloud', ' ☁')}</option>)}
                </select>
                <button
                  type="button"
                  onClick={handleAttachPdf}
                  className="glass-btn p-2 flex items-center justify-center"
                  disabled={chatLoading}
                  title="Attach PDF"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                </button>
                <button
                  type="submit"
                  className="dawn-btn group relative p-3 rounded-xl flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                  disabled={chatLoading || (!chatInput.trim() && !pendingAttachment)}
                  tabIndex={-1}
                  aria-label="Send"
                >
                  <svg className="vortex-send w-5 h-5" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
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
      </div>
    </div>
  )
}

export default Queue
