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
import ModelSelector from "../components/ui/ModelSelector"

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
  const [chatMessages, setChatMessages] = useState<{role: "user"|"ai", text: string}[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [currentModel, setCurrentModel] = useState<{ provider: string; model: string }>({ provider: "ollama", model: "mixtral:8x7b" })

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
    if (!chatInput.trim()) return
    setChatMessages((msgs) => [...msgs, { role: "user", text: chatInput }])
    setChatLoading(true)
    setChatInput("")
    try {
      const response = await window.electronAPI.invoke("ai-chat", chatInput)
      setChatMessages((msgs) => [...msgs, { role: "ai", text: response }])
    } catch (err) {
      setChatMessages((msgs) => [...msgs, { role: "ai", text: "Error: " + String(err) }])
    } finally {
      setChatLoading(false)
      chatInputRef.current?.focus()
    }
  }

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  // Load current model configuration on mount
  useEffect(() => {
    const loadCurrentModel = async () => {
      try {
        const config = await window.electronAPI.getCurrentLlmConfig();
        setCurrentModel({ provider: config.provider, model: config.model });
      } catch (error) {
        console.error('Error loading current model config:', error);
      }
    };
    loadCurrentModel();
  }, []);

  useEffect(() => {
    const updateDimensions = () => {
      if (contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight
        const contentWidth = contentRef.current.scrollWidth
        if (isTooltipVisible) {
          contentHeight += tooltipHeight
        }
        window.electronAPI.updateContentDimensions({
          width: contentWidth,
          height: contentHeight
        })
      }
    }

    const resizeObserver = new ResizeObserver(updateDimensions)
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current)
    }
    updateDimensions()

    const cleanupFunctions = [
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
      resizeObserver.disconnect()
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [isTooltipVisible, tooltipHeight])

  // Seamless screenshot-to-LLM flow
  useEffect(() => {
    const unsubscribe = window.electronAPI.onScreenshotTaken(async (data) => {
      await refetch();
      setChatLoading(true);
      try {
        const latest = data?.path || (Array.isArray(data) && data.length > 0 && data[data.length - 1]?.path);
        if (latest) {
          const response = await window.electronAPI.invoke("analyze-image-file", latest);
          setChatMessages((msgs) => [...msgs, { role: "ai", text: response.text }]);
        }
      } catch (err) {
        setChatMessages((msgs) => [...msgs, { role: "ai", text: "Error: " + String(err) }]);
      } finally {
        setChatLoading(false);
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

  const handleSettingsToggle = () => {
    setIsSettingsOpen(!isSettingsOpen)
  }

  const handleModelChange = (provider: "ollama" | "cloud", model: string) => {
    setCurrentModel({ provider, model })
    setChatMessages((msgs) => [...msgs, {
      role: "ai",
      text: `Switched to ${model}. Ready for your questions!`
    }])
  }


  return (
    <div
      ref={barRef}
      style={{
        position: "relative",
        width: "100%",
        pointerEvents: "auto"
      }}
      className="select-none"
    >
      <div className="bg-transparent w-full">
        <div className="px-2 py-1.5">
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
              onSettingsToggle={handleSettingsToggle}
            />
          </div>
          {/* Settings Panel */}
          {isSettingsOpen && (
            <div className="mt-3 w-full mx-auto animate-slide-up">
              <ModelSelector onModelChange={handleModelChange} onChatOpen={() => setIsChatOpen(true)} />
            </div>
          )}

          {/* Chat Interface */}
          {isChatOpen && (
            <div className="mt-3 w-full mx-auto liquid-glass chat-container p-4 flex flex-col">
              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto mb-3 p-3 rounded-xl glass-content max-h-64 min-h-[120px] border border-red-200/30 bg-white/50 shadow-inner">
                {chatMessages.length === 0 ? (
                  <div className="text-center mt-6 space-y-2 animate-fade-in">
                    <div className="text-sm text-red-800/60 font-medium tracking-tight">
                      {currentModel.model}
                    </div>
                    <div className="text-[11px] text-red-600/40">
                      Copy text &rarr; click paste button to send
                    </div>
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`w-full flex ${msg.role === "user" ? "justify-end" : "justify-start"} mb-2.5 animate-slide-up`}
                      style={{ animationDelay: '0ms' }}
                    >
                      <div
                        className={`max-w-[80%] px-3.5 py-2.5 text-[12.5px] leading-relaxed ${
                          msg.role === "user"
                            ? "chat-bubble-user ml-8"
                            : "chat-bubble-ai mr-8"
                        }`}
                        style={{ wordBreak: "break-word" }}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))
                )}
                {chatLoading && (
                  <div className="flex justify-start mb-2 animate-fade-in">
                    <div className="chat-bubble-ai px-4 py-3 mr-8">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="loading-dot w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                        <span className="loading-dot w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                        <span className="loading-dot w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                      </span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              {/* Input Area */}
              <form className="flex gap-2 items-center glass-content" onSubmit={e => { e.preventDefault(); handleChatSend(); }}>
                <div
                  className="glass-input flex-1 px-3.5 py-2.5 text-xs min-h-[34px] cursor-text truncate"
                  onClick={() => {
                    // Read from clipboard and paste into input (no focus steal)
                    navigator.clipboard.readText().then(text => {
                      if (text.trim()) {
                        setChatInput(text.trim())
                      }
                    }).catch(() => {})
                  }}
                >
                  {chatInput || <span className="text-red-400/40">Click to paste from clipboard...</span>}
                </div>
                {/* Paste & Send: reads clipboard and sends immediately */}
                <button
                  type="button"
                  className="glass-btn p-2.5 rounded-xl flex items-center justify-center hover:bg-red-500/15"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText()
                      if (text.trim()) {
                        setChatInput(text.trim())
                        // Auto-send after paste
                        setChatMessages(msgs => [...msgs, { role: "user", text: text.trim() }])
                        setChatLoading(true)
                        setChatInput("")
                        try {
                          const response = await window.electronAPI.invoke("ai-chat", text.trim())
                          setChatMessages(msgs => [...msgs, { role: "ai", text: response }])
                        } catch (err) {
                          setChatMessages(msgs => [...msgs, { role: "ai", text: "Error: " + String(err) }])
                        } finally {
                          setChatLoading(false)
                        }
                      }
                    } catch {}
                  }}
                  disabled={chatLoading}
                  tabIndex={-1}
                  aria-label="Paste from clipboard & send"
                  title="Paste from clipboard & send"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                  </svg>
                </button>
                <button
                  type="submit"
                  className="btn-primary p-2.5 rounded-xl flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none"
                  disabled={chatLoading || !chatInput.trim()}
                  tabIndex={-1}
                  aria-label="Send"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="white" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-7.5-15-7.5v6l10 1.5-10 1.5v6z" />
                  </svg>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Queue
