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
import MarkdownMessage from "../components/Chat/MarkdownMessage"

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
  const [pendingAttachment, setPendingAttachment] = useState<{ transcript: string; frames: string[] } | null>(null)

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
    const attachment = pendingAttachment
    const userText = chatInput.trim()

    if (!userText && !attachment) return

    const displayText = attachment
      ? `[Video] ${userText || 'Analyze this recording'}`
      : userText

    setChatMessages((msgs) => [...msgs, { role: "user", text: displayText }])
    setChatLoading(true)
    setChatInput("")
    setPendingAttachment(null)

    try {
      let response: string
      if (attachment) {
        const prompt = userText
          ? `${userText}\n\nAudio transcript from recording:\n"${attachment.transcript}"\n\nThe attached images are frames captured from the screen during recording.`
          : `The user recorded their screen while speaking. Audio transcript:\n"${attachment.transcript}"\n\nThe attached images are frames from the screen recording. Analyze what is shown and provide a helpful response.`
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
      resizeObserver.disconnect()
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [isTooltipVisible, tooltipHeight])

  // Screenshot → attach to chat for review before sending
  useEffect(() => {
    const unsubscribe = window.electronAPI.onScreenshotTaken(async (data) => {
      await refetch();
      if (data?.preview) {
        const base64 = data.preview.replace(/^data:image\/\w+;base64,/, '')
        setPendingAttachment({ transcript: '', frames: [base64] })
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

  const handleSettingsToggle = () => {
    setIsSettingsOpen(!isSettingsOpen)
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
    setPendingAttachment({ transcript, frames })
    setTimeout(() => chatInputRef.current?.focus(), 50)
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
              onVoiceMessage={handleVoiceMessage}
              onScreenRecordingMessage={handleScreenRecordingMessage}
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
                      Ctrl+Shift+H to screenshot &middot; Models to switch
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
                        {msg.role === "ai" ? <MarkdownMessage content={msg.text} /> : msg.text}
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
              {/* Attachment Preview */}
              {pendingAttachment && (
                <div className="mx-2 mb-1 ml-auto p-2 rounded-lg bg-white/5 border border-white/10 animate-fade-in max-w-[70%]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-red-200/80">
                      Video attached, type your prompt
                    </span>
                    <button
                      type="button"
                      className="text-[10px] text-red-400/60 hover:text-red-300 transition-colors ml-3"
                      onClick={() => setPendingAttachment(null)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
              {/* Input Area */}
              <form className="flex gap-2 items-center glass-content" onSubmit={e => { e.preventDefault(); handleChatSend(); }}>
                <input
                  ref={chatInputRef}
                  className="glass-input flex-1 px-3.5 py-2.5 text-xs"
                  placeholder={pendingAttachment ? "Add a message or press Send..." : "Ask anything..."}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  disabled={chatLoading}
                />
                <button
                  type="submit"
                  className="btn-primary p-2.5 rounded-xl flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none"
                  disabled={chatLoading || (!chatInput.trim() && !pendingAttachment)}
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
