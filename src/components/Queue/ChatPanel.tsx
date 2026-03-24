import React from "react"
import { AnimatePresence, motion } from "framer-motion"
import MarkdownMessage from "../Chat/MarkdownMessage"
import { listContainerVariants, listItemVariants, panelVariants } from "../../lib/motion"

export type ChatMessage = {
  role: "user" | "ai"
  text: string
  attachment?: { type: string; fileName?: string }
}

export type PendingAttachment = {
  transcript: string
  frames: string[]
  type?: "recording" | "screenshot" | "pdf"
  fileName?: string
} | null

type ChatPanelProps = {
  chatMessages: ChatMessage[]
  chatLoading: boolean
  thinkingWord: string
  chatInput: string
  setChatInput: React.Dispatch<React.SetStateAction<string>>
  chatInputRef: React.RefObject<HTMLInputElement>
  chatEndRef: React.RefObject<HTMLDivElement>
  pendingAttachment: PendingAttachment
  setPendingAttachment: React.Dispatch<React.SetStateAction<PendingAttachment>>
  handleChatSend: () => Promise<void>
  handleAttachPdf: () => Promise<void>
  allModels: string[]
  currentModel: { provider: string; model: string }
  isModelPickerOpen: boolean
  setIsModelPickerOpen: React.Dispatch<React.SetStateAction<boolean>>
  modelPickerRef: React.RefObject<HTMLDivElement>
  handleModelSwitch: (model: string) => Promise<void>
}

const AttachmentPreview: React.FC<{
  pendingAttachment: PendingAttachment
  removeAttachment: () => void
}> = ({ pendingAttachment, removeAttachment }) => {
  if (!pendingAttachment) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      className="absolute bottom-full right-0 mb-1 z-10"
    >
      <div className="liquid-glass-dark px-2.5 py-1.5 flex items-center gap-2 text-[11px] rounded-lg max-w-[220px]">
        <span className="cmd-label font-medium truncate">
          {pendingAttachment.type === "pdf"
            ? `PDF ${pendingAttachment.fileName}`
            : pendingAttachment.type === "screenshot"
              ? "Screenshot"
              : "Recording"}
        </span>
        <button
          type="button"
          className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0 text-[10px]"
          onClick={removeAttachment}
          title="Remove attachment"
          aria-label="Remove attachment"
        >
          X
        </button>
      </div>
    </motion.div>
  )
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  chatMessages,
  chatLoading,
  thinkingWord,
  chatInput,
  setChatInput,
  chatInputRef,
  chatEndRef,
  pendingAttachment,
  setPendingAttachment,
  handleChatSend,
  handleAttachPdf,
  allModels,
  currentModel,
  isModelPickerOpen,
  setIsModelPickerOpen,
  modelPickerRef,
  handleModelSwitch,
}) => {
  return (
    <motion.div
      variants={panelVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-full mx-auto liquid-glass chat-container aura-strong p-0 flex flex-col overflow-hidden flex-1 min-h-0"
    >
      <div className="vortex-watermark" />

      <div className="flex-1 min-h-0 overflow-y-auto mb-2 px-3 py-2">
        {chatMessages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center h-full"
          >
            <div className="text-[14px] text-[var(--text-tertiary)] font-medium">
              Ask your personal assistant
            </div>
          </motion.div>
        ) : (
          <motion.div variants={listContainerVariants} initial="initial" animate="animate" className="w-full">
            <AnimatePresence initial={false}>
              {chatMessages.map((msg, idx) => (
                <motion.div
                  key={`${msg.role}-${idx}-${msg.text.slice(0, 20)}`}
                  variants={listItemVariants}
                  exit="exit"
                  className={`w-full flex ${msg.role === "user" ? "justify-end" : "justify-start"} mb-2`}
                >
                  <div
                    className={`max-w-[85%] ${msg.role === "user" ? "ml-6 items-end" : "mr-6 items-start"} flex flex-col gap-1`}
                  >
                    {msg.role === "user" && msg.attachment && (
                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-[hsla(215,25%,15%,0.8)] border border-[hsla(0,0%,0%,0.08)] dark:border-[hsla(200,40%,60%,0.15)]">
                        <div className="w-6 h-6 rounded-md bg-red-500 flex items-center justify-center flex-shrink-0">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium text-[var(--text-primary)] truncate max-w-[180px]">
                            {msg.attachment.fileName || "File"}
                          </div>
                          <div className="text-[9px] text-[var(--text-secondary)]">
                            {msg.attachment.type === "pdf"
                              ? "PDF"
                              : msg.attachment.type === "screenshot"
                                ? "Screenshot"
                                : "Recording"}
                          </div>
                        </div>
                      </div>
                    )}
                    <div
                      className={`px-3.5 py-2.5 text-[14px] leading-relaxed ${msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}`}
                      style={{ wordBreak: "break-word" }}
                    >
                      {msg.role === "ai" ? <MarkdownMessage content={msg.text} /> : msg.text}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        <AnimatePresence>
          {chatLoading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="flex justify-start mb-2"
            >
              <div className="chat-bubble-ai px-3.5 py-2.5 mr-6">
                <span className="inline-flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1" aria-hidden="true">
                    <span className="loading-dot w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                    <span className="loading-dot w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                    <span className="loading-dot w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                  </span>
                  <span className="text-[12px] text-[var(--text-secondary)] font-medium tracking-wide animate-thinking-word">
                    {thinkingWord}...
                  </span>
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={chatEndRef} />
      </div>

      <div className="relative px-3 pb-3">
        <AnimatePresence>
          <AttachmentPreview pendingAttachment={pendingAttachment} removeAttachment={() => setPendingAttachment(null)} />
        </AnimatePresence>

        <form
          className="flex gap-1.5 items-center glass-content"
          onSubmit={(e) => {
            e.preventDefault()
            void handleChatSend()
          }}
        >
          <input
            ref={chatInputRef}
            className="glass-input flex-1 px-3 py-2.5 text-[13px]"
            placeholder={pendingAttachment ? "Add a message or press Enter..." : "Ask anything..."}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !chatLoading && (chatInput.trim() || pendingAttachment)) {
                e.preventDefault()
                void handleChatSend()
              }
            }}
            disabled={chatLoading}
            aria-label="Chat input"
          />

          <div className="relative" ref={modelPickerRef}>
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/6 hover:bg-white/12 border border-white/8 hover:border-white/15 transition-all duration-200 cursor-pointer group"
              onClick={() => setIsModelPickerOpen((prev) => !prev)}
              disabled={chatLoading}
              aria-haspopup="listbox"
              aria-expanded={isModelPickerOpen}
              aria-label="Select model"
            >
              <span className="text-[10px] font-medium tracking-wide text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                Model
              </span>
              <svg
                className={`w-2.5 h-2.5 text-[var(--text-tertiary)] transition-transform duration-200 ${isModelPickerOpen ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            <AnimatePresence>
              {isModelPickerOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="absolute bottom-full right-0 mb-1.5 z-50"
                >
                  <div className="liquid-glass-dark rounded-xl p-1 min-w-[140px] max-h-[200px] overflow-y-auto shadow-xl border border-white/10" role="listbox">
                    {allModels.map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-all duration-150 flex items-center gap-2 ${
                          currentModel.model === m
                            ? "bg-white/15 text-[var(--text-primary)] dark:text-white font-medium"
                            : "text-[var(--text-secondary)] hover:bg-white/8 hover:text-[var(--text-primary)] dark:hover:text-white"
                        }`}
                        onClick={() => {
                          void handleModelSwitch(m)
                          setIsModelPickerOpen(false)
                        }}
                        role="option"
                        aria-selected={currentModel.model === m}
                      >
                        {m.includes(":cloud") && <span className="text-[9px] opacity-60">C</span>}
                        <span className="truncate">{m.replace(":cloud", "").replace(":", "/")}</span>
                        {currentModel.model === m && (
                          <svg className="w-3 h-3 ml-auto flex-shrink-0 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={() => void handleAttachPdf()}
            className="w-7 h-7 rounded-lg bg-white/6 hover:bg-white/12 border border-white/8 hover:border-white/15 transition-all duration-200 flex items-center justify-center group"
            disabled={chatLoading}
            title="Attach PDF"
            aria-label="Attach PDF"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>

          <button
            type="submit"
            className="dawn-btn group relative p-2 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={chatLoading || (!chatInput.trim() && !pendingAttachment)}
            aria-label="Send"
          >
            <svg className="vortex-send w-4 h-4" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
              <g transform="translate(256,256)">
                <path d="M 0,-180 C 80,-170 160,-100 170,-20 C 180,60 120,130 40,150 C -40,170 -110,120 -130,50 C -150,-20 -100,-80 -40,-90 C 20,-100 60,-60 60,-10 C 60,30 30,50 0,50" fill="none" stroke="currentColor" strokeWidth="32" strokeLinecap="round" />
                <path d="M 0,180 C -80,170 -160,100 -170,20 C -180,-60 -120,-130 -40,-150 C 40,-170 110,-120 130,-50 C 150,20 100,80 40,90 C -20,100 -60,60 -60,10 C -60,-30 -30,-50 0,-50" fill="none" stroke="currentColor" strokeWidth="32" strokeLinecap="round" />
                <path d="M -180,0 C -170,-80 -100,-160 -20,-170 C 60,-180 130,-120 150,-40 C 170,40 120,110 50,130 C -20,150 -80,100 -90,40 C -100,-20 -60,-60 -10,-60 C 30,-60 50,-30 50,0" fill="none" stroke="currentColor" strokeWidth="26" strokeLinecap="round" />
                <path d="M 180,0 C 170,80 100,160 20,170 C -60,180 -130,120 -150,40 C -170,-40 -120,-110 -50,-130 C 20,-150 80,-100 90,-40 C 100,20 60,60 10,60 C -30,60 -50,30 -50,0" fill="none" stroke="currentColor" strokeWidth="26" strokeLinecap="round" />
                <circle cx="0" cy="0" r="38" fill="currentColor" />
              </g>
            </svg>
            <span className="dawn-tooltip">Send</span>
          </button>
        </form>
      </div>
    </motion.div>
  )
}

export default ChatPanel
