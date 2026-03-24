import React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { IoLogOutOutline, IoMoonOutline, IoSunnyOutline } from "react-icons/io5"
import { panelVariants } from "../../../lib/motion"
import { QUEUE_SHORTCUTS } from "../shortcuts"

type LanguageOption = { code: string; name: string; downloaded: boolean }

type KbdProps = {
  children: React.ReactNode
}

export const Kbd: React.FC<KbdProps> = ({ children }) => <span className="kbd-key">{children}</span>

type ShortcutsBarProps = {
  isListening: boolean
  hasScreenshots: boolean
}

export const ShortcutsBar: React.FC<ShortcutsBarProps> = ({ isListening, hasScreenshots }) => {
  return (
    <motion.div
      variants={panelVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="text-xs liquid-glass-bar aura py-0.5 px-2 flex items-center justify-center gap-2 draggable-area w-fit mx-auto"
    >
      <div className="flex items-center gap-1.5 group/cmd">
        <span className="cmd-label text-[11px] leading-none font-medium">Show/Hide</span>
        <div className="flex gap-0.5">
          <Kbd>Ctrl</Kbd>
          <Kbd>B</Kbd>
        </div>
      </div>

      <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-slate-400/30 to-transparent" />

      <div className="flex items-center gap-1.5 group/cmd">
        <span className="cmd-label text-[11px] leading-none font-medium">Stealth</span>
        <div className="flex gap-0.5">
          <Kbd>Ctrl</Kbd>
          <Kbd>Shift</Kbd>
          <Kbd>G</Kbd>
        </div>
      </div>

      <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-slate-400/30 to-transparent" />

      <div className="flex items-center gap-1.5 group/cmd">
        <span className="cmd-label text-[11px] leading-none font-medium">Screenshot</span>
        <div className="flex gap-0.5">
          <Kbd>Ctrl</Kbd>
          <Kbd>Shift</Kbd>
          <Kbd>H</Kbd>
        </div>
      </div>

      {isListening && (
        <>
          <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-slate-400/30 to-transparent" />
          <div className="flex items-center gap-1.5 group/cmd animate-fade-in">
            <span className="cmd-label text-[11px] leading-none font-medium">Ask AI</span>
            <div className="flex gap-0.5">
              <Kbd>H</Kbd>
            </div>
          </div>
        </>
      )}

      {hasScreenshots && (
        <>
          <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-slate-400/30 to-transparent" />
          <div className="flex items-center gap-1.5 group/cmd animate-fade-in">
            <span className="cmd-label text-[11px] leading-none font-medium">Solve</span>
            <div className="flex gap-0.5">
              <Kbd>Ctrl</Kbd>
              <Kbd>Shift</Kbd>
              <Kbd>Enter</Kbd>
            </div>
          </div>
        </>
      )}
    </motion.div>
  )
}

type ActionBarProps = {
  isRecording: boolean
  isListening: boolean
  onRecordClick: () => void
  onListenClick: () => void
  onChatToggle: () => void
  isDark: boolean
  onToggleTheme: () => void
  currentLang: { code: string; name: string }
  isLangPickerOpen: boolean
  onLangPickerToggle: () => void
  languages: LanguageOption[]
  langDownloading: string | null
  onLanguageSwitch: (code: string) => void
  langPickerRef: React.RefObject<HTMLDivElement>
  isHelpMode: boolean
  onHelpToggle: () => void
  onQuit: () => void
}

export const ActionBar: React.FC<ActionBarProps> = ({
  isRecording,
  isListening,
  onRecordClick,
  onListenClick,
  onChatToggle,
  isDark,
  onToggleTheme,
  currentLang,
  isLangPickerOpen,
  onLangPickerToggle,
  languages,
  langDownloading,
  onLanguageSwitch,
  langPickerRef,
  isHelpMode,
  onHelpToggle,
  onQuit,
}) => {
  return (
    <motion.div
      variants={panelVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="text-xs liquid-glass-bar py-0.5 px-2 flex items-center justify-center gap-2 w-fit mx-auto draggable-area"
    >
      <div className="flex items-center gap-1 group/cmd">
        <button
          className={`glass-btn flex items-center gap-1.5 ${isRecording ? "animate-glow" : ""}`}
          onClick={onRecordClick}
          type="button"
          aria-pressed={isRecording}
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${isRecording ? "bg-red-500 animate-pulse" : "bg-red-400/70"}`} />
          {isRecording ? "Stop" : "Record"}
        </button>
        {!isRecording && (
          <div className="flex gap-0.5">
            <Kbd>Ctrl</Kbd>
            <Kbd>Shift</Kbd>
            <Kbd>O</Kbd>
          </div>
        )}
      </div>

      <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-slate-400/30 to-transparent" />

      <div className="flex items-center gap-1 group/cmd">
        <button
          className={`glass-btn flex items-center gap-1.5 ${isListening ? "animate-glow" : ""}`}
          onClick={onListenClick}
          type="button"
          aria-pressed={isListening}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
          {isListening ? "Stop" : "Listen"}
        </button>
        {!isListening && (
          <div className="flex gap-0.5">
            <Kbd>Ctrl</Kbd>
            <Kbd>Shift</Kbd>
            <Kbd>J</Kbd>
          </div>
        )}
      </div>

      <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-slate-400/30 to-transparent" />

      <div className="flex items-center gap-1 group/cmd">
        <button className="glass-btn flex items-center gap-1.5" onClick={onChatToggle} type="button" aria-label="Toggle chat">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          Chat
        </button>
        <div className="flex gap-0.5">
          <Kbd>Ctrl</Kbd>
          <Kbd>Shift</Kbd>
          <Kbd>C</Kbd>
        </div>
      </div>

      <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-slate-400/30 to-transparent" />

      <button
        className="w-5 h-5 rounded-full bg-white/8 hover:bg-white/15 transition-all duration-200 flex items-center justify-center border border-white/5 hover:border-white/10 interactive"
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        onClick={onToggleTheme}
        type="button"
        aria-label="Toggle theme"
      >
        {isDark ? <IoSunnyOutline className="w-3 h-3 bar-icon" /> : <IoMoonOutline className="w-3 h-3 bar-icon" />}
      </button>

      <div className="relative" ref={langPickerRef}>
        <button
          className="w-auto h-5 px-1.5 rounded-full bg-white/8 hover:bg-white/15 transition-all duration-200 flex items-center justify-center border border-white/5 hover:border-white/10 interactive gap-1"
          title={`Language: ${currentLang.name}`}
          onClick={onLangPickerToggle}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isLangPickerOpen}
        >
          <span className="text-[9px] bar-icon font-medium uppercase">{currentLang.code}</span>
          <svg className="w-2 h-2 bar-icon opacity-50" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        <AnimatePresence>
          {isLangPickerOpen && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="absolute top-7 right-0 z-50 w-40 max-h-48 overflow-y-auto liquid-glass-dark shadow-2xl rounded-lg p-1.5"
            >
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors duration-150 flex items-center justify-between ${
                    lang.code === currentLang.code ? "bg-white/15 text-white" : "hover:bg-white/10 text-[var(--text-secondary)]"
                  }`}
                  onClick={() => onLanguageSwitch(lang.code)}
                  disabled={langDownloading !== null}
                  type="button"
                >
                  <span>{lang.name}</span>
                  <span className="flex items-center gap-1">
                    {langDownloading === lang.code && <span className="text-[9px] text-indigo-400 animate-pulse">...</span>}
                    {lang.downloaded ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400/60" title="Downloaded" />
                    ) : (
                      <span className="text-[9px] text-white/30">DL</span>
                    )}
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button className="inline-block interactive" onClick={onHelpToggle} type="button" aria-pressed={isHelpMode}>
        <div
          className={`w-5 h-5 rounded-full transition-all duration-200 flex items-center justify-center cursor-pointer border ${
            isHelpMode ? "bg-white/15 border-white/15" : "bg-white/8 hover:bg-white/15 border-white/5 hover:border-white/10"
          }`}
        >
          <span className="text-[10px] bar-icon">?</span>
        </div>
      </button>

      <button className="bar-icon transition-all duration-200 hover:scale-110" title="Quit" onClick={onQuit} aria-label="Quit app">
        <IoLogOutOutline className="w-4 h-4" />
      </button>
    </motion.div>
  )
}

type HelpTooltipProps = {
  tooltipRef: React.RefObject<HTMLDivElement>
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ tooltipRef }) => {
  return (
    <motion.div ref={tooltipRef} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} className="mb-2 w-72 z-50 mx-auto">
      <div className="p-3.5 text-xs liquid-glass-dark text-[var(--text-primary)] shadow-2xl">
        <h3 className="font-semibold mb-3 text-[13px]">Keyboard Shortcuts</h3>
        <div className="space-y-2.5">
          {QUEUE_SHORTCUTS.map(({ label, keys, desc }) => (
            <div key={label} className="flex items-start justify-between gap-3 group/item">
              <div>
                <div className="font-medium transition-colors duration-200">{label}</div>
                <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">{desc}</div>
              </div>
              <div className="flex gap-1 flex-shrink-0 mt-0.5">
                {keys.map((k) => (
                  <span key={k} className="kbd-key">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

type RecordStatusPanelProps = {
  recordStatus: string
  isRecording: boolean
  onStop: () => void
}

export const RecordStatusPanel: React.FC<RecordStatusPanelProps> = ({ recordStatus, isRecording, onStop }) => {
  return (
    <motion.div variants={panelVariants} initial="initial" animate="animate" exit="exit" className="mt-1 listen-panel liquid-glass-dark p-0 text-xs mx-auto w-fit min-w-[280px] overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          {isRecording && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
          )}
          <span className="font-semibold text-[13px] text-red-500">{isRecording ? "Recording" : recordStatus.startsWith("Error") ? "Error" : "Processing"}</span>
        </div>
        {isRecording && (
          <button onClick={onStop} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-all" type="button">
            Stop
          </button>
        )}
      </div>
      <div className="px-3.5 pb-2.5">
        <div className={`text-[12px] leading-relaxed ${recordStatus.startsWith("Error") ? "text-red-500" : "text-[var(--text-secondary)]"}`}>{recordStatus}</div>
        {isRecording && <div className="mt-1.5 text-[10px] text-[var(--text-tertiary)]">Auto-capturing screen every 15s for context</div>}
      </div>
    </motion.div>
  )
}

type ListenStatusPanelProps = {
  listenStatus: string
  isListening: boolean
  listenElapsed: number
  liveAiSuggestion: string | null
  liveAiLoading: boolean
  customPrompt: string
  onCustomPromptChange: (value: string) => void
  onStop: () => void
}

export const ListenStatusPanel: React.FC<ListenStatusPanelProps> = ({
  listenStatus,
  isListening,
  listenElapsed,
  liveAiSuggestion,
  liveAiLoading,
  customPrompt,
  onCustomPromptChange,
  onStop,
}) => {
  return (
    <motion.div variants={panelVariants} initial="initial" animate="animate" exit="exit" className="mt-1 listen-panel liquid-glass-dark p-0 text-xs mx-auto w-fit min-w-[360px] max-w-lg overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-white/8">
        <div className="flex items-center gap-2.5">
          {isListening && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500" />
            </span>
          )}
          <span className="font-semibold text-[13px] text-teal-500 dark:text-teal-400">
            {isListening ? "Listening" : listenStatus.startsWith("Error") ? "Error" : listenStatus.startsWith("Transcript") ? "Done" : "Processing"}
          </span>
          {isListening && <span className="text-teal-400/60 font-mono text-[12px] tabular-nums">{Math.floor(listenElapsed / 60)}:{String(listenElapsed % 60).padStart(2, "0")}</span>}
        </div>
        {isListening && (
          <button onClick={onStop} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-all" type="button">
            Stop
          </button>
        )}
      </div>

      <div className="px-3.5 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1">Transcript</div>
        <div className={`text-[13px] leading-relaxed max-h-[80px] overflow-y-auto ${listenStatus.startsWith("Error") ? "text-red-500" : "text-[var(--text-primary)]"}`}>
          {listenStatus || "Waiting for speech..."}
        </div>
      </div>

      {isListening && (liveAiSuggestion || liveAiLoading) && (
        <div className="px-3.5 py-2.5 border-t border-white/8 bg-indigo-500/[0.04] dark:bg-indigo-400/[0.06]">
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="w-3 h-3 text-indigo-500 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <span className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider">AI Suggestion</span>
            {liveAiLoading && (
              <span className="inline-flex items-center gap-0.5 ml-1">
                <span className="loading-dot w-1 h-1 rounded-full bg-indigo-400 inline-block" />
                <span className="loading-dot w-1 h-1 rounded-full bg-indigo-400 inline-block" />
                <span className="loading-dot w-1 h-1 rounded-full bg-indigo-400 inline-block" />
              </span>
            )}
          </div>
          {liveAiSuggestion && <div className="text-[13px] leading-relaxed text-[var(--text-primary)] max-h-[80px] overflow-y-auto">{liveAiSuggestion}</div>}
        </div>
      )}

      {isListening && (
        <div className="px-3.5 py-2.5 border-t border-white/8">
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            {["What should I say?", "Follow-up questions", "Summarize"].map((label) => (
              <button
                key={label}
                onClick={onStop}
                className="listen-suggestion-btn px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/8 dark:bg-white/6 text-[var(--text-secondary)] hover:bg-indigo-500 hover:text-white transition-all cursor-pointer border border-white/10 hover:border-indigo-500"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={customPrompt}
            onChange={(e) => onCustomPromptChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customPrompt.trim()) {
                onStop()
              }
            }}
            placeholder="Ask anything about the conversation..."
            className="w-full px-3 py-2 rounded-lg bg-white/8 dark:bg-white/6 text-[12px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:bg-white/15 dark:focus:bg-white/10 transition-colors border border-white/8 focus:border-indigo-400/30"
          />
        </div>
      )}
    </motion.div>
  )
}
