import React, { useState, useEffect, useRef } from "react"
import { IoLogOutOutline } from "react-icons/io5"

interface QueueCommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  screenshots: Array<{ path: string; preview: string }>
  onChatToggle: () => void
  onSettingsToggle: () => void
}

const QueueCommands: React.FC<QueueCommandsProps> = ({
  onTooltipVisibilityChange,
  screenshots,
  onChatToggle,
  onSettingsToggle
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [audioResult, setAudioResult] = useState<string | null>(null)
  const chunks = useRef<Blob[]>([])

  useEffect(() => {
    let tooltipHeight = 0
    if (tooltipRef.current && isTooltipVisible) {
      tooltipHeight = tooltipRef.current.offsetHeight + 10
    }
    onTooltipVisibilityChange(isTooltipVisible, tooltipHeight)
  }, [isTooltipVisible])

  const handleRecordClick = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const recorder = new MediaRecorder(stream)
        recorder.ondataavailable = (e) => chunks.current.push(e.data)
        recorder.onstop = async () => {
          const blob = new Blob(chunks.current, { type: chunks.current[0]?.type || 'audio/webm' })
          chunks.current = []
          const reader = new FileReader()
          reader.onloadend = async () => {
            const base64Data = (reader.result as string).split(',')[1]
            try {
              const result = await window.electronAPI.analyzeAudioFromBase64(base64Data, blob.type)
              setAudioResult(result.text)
            } catch {
              setAudioResult('Audio analysis failed.')
            }
          }
          reader.readAsDataURL(blob)
        }
        setMediaRecorder(recorder)
        recorder.start()
        setIsRecording(true)
      } catch {
        setAudioResult('Could not start recording.')
      }
    } else {
      mediaRecorder?.stop()
      setIsRecording(false)
      setMediaRecorder(null)
    }
  }

  const Kbd = ({ children }: { children: React.ReactNode }) => (
    <span className="kbd-key">{children}</span>
  )

  return (
    <div className="w-fit">
      <div className="text-xs liquid-glass-bar py-1 px-3 flex items-center justify-center gap-2.5 draggable-area">

        {/* Show/Hide */}
        <div className="flex items-center gap-1.5 group/cmd">
          <span className="text-[11px] leading-none text-red-200/80 font-medium transition-colors duration-200 group-hover/cmd:text-red-100">
            Show/Hide
          </span>
          <div className="flex gap-0.5">
            <Kbd>Ctrl</Kbd><Kbd>B</Kbd>
          </div>
        </div>

        <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/20 to-transparent" />

        {/* Screenshot */}
        <div className="flex items-center gap-1.5 group/cmd">
          <span className="text-[11px] leading-none text-red-200/80 font-medium transition-colors duration-200 group-hover/cmd:text-red-100">
            Screenshot
          </span>
          <div className="flex gap-0.5">
            <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>H</Kbd>
          </div>
        </div>

        {/* Solve */}
        {screenshots.length > 0 && (
          <>
            <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/20 to-transparent" />
            <div className="flex items-center gap-1.5 group/cmd animate-fade-in">
              <span className="text-[11px] leading-none text-red-200/80 font-medium transition-colors duration-200 group-hover/cmd:text-red-100">
                Solve
              </span>
              <div className="flex gap-0.5">
                <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>Enter</Kbd>
              </div>
            </div>
          </>
        )}

        <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/20 to-transparent" />

        {/* Voice Recording */}
        <button
          className={`glass-btn flex items-center gap-1.5 transition-all duration-300 ${
            isRecording
              ? 'bg-[hsla(0,72%,51%,0.3)] border-[hsla(0,72%,51%,0.4)] text-white animate-glow'
              : ''
          }`}
          onClick={handleRecordClick}
          type="button"
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full transition-all duration-300 ${
            isRecording ? 'bg-[hsl(0,72%,60%)] animate-pulse' : 'bg-[hsla(0,72%,60%,0.5)]'
          }`} />
          {isRecording ? 'Stop' : 'Record'}
        </button>

        {/* Chat */}
        <button
          className="glass-btn"
          onClick={onChatToggle}
          type="button"
        >
          Chat
        </button>

        {/* Models */}
        <button
          className="glass-btn"
          onClick={onSettingsToggle}
          type="button"
        >
          Models
        </button>

        {/* Help tooltip */}
        <div
          className="relative inline-block interactive"
          onMouseEnter={() => setIsTooltipVisible(true)}
          onMouseLeave={() => setIsTooltipVisible(false)}
        >
          <div className="w-5 h-5 rounded-full bg-white/8 hover:bg-white/15 transition-all duration-200 flex items-center justify-center cursor-help border border-white/5 hover:border-white/10">
            <span className="text-[10px] text-red-200/70">?</span>
          </div>
          {isTooltipVisible && (
            <div ref={tooltipRef} className="absolute top-full right-0 mt-2 w-72 z-50 animate-scale-in">
              <div className="p-3.5 text-xs liquid-glass-dark text-red-100/90 shadow-2xl">
                <h3 className="font-semibold text-red-200 mb-3 text-[13px]">Keyboard Shortcuts</h3>
                <div className="space-y-2.5">
                  {[
                    { label: 'Toggle Window', keys: ['Ctrl', 'B'], desc: 'Show or hide this window' },
                    { label: 'Screenshot', keys: ['Ctrl', 'Shift', 'H'], desc: 'Capture current screen' },
                    { label: 'Solve', keys: ['Ctrl', 'Shift', 'Enter'], desc: 'Generate solution from screenshots' },
                    { label: 'Reset', keys: ['Ctrl', 'Shift', 'R'], desc: 'Clear all screenshots & reset' },
                    { label: 'Center Window', keys: ['Ctrl', 'Shift', 'Space'], desc: 'Center and show window' },
                    { label: 'Move Window', keys: ['Ctrl', 'Shift', 'Arrows'], desc: 'Reposition the window' },
                  ].map(({ label, keys, desc }) => (
                    <div key={label} className="flex items-start justify-between gap-3 group/item">
                      <div>
                        <div className="font-medium text-red-200 group-hover/item:text-red-100 transition-colors duration-200">{label}</div>
                        <div className="text-[10px] text-red-300/50 mt-0.5">{desc}</div>
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
        </div>

        <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/20 to-transparent" />

        {/* Quit */}
        <button
          className="text-red-400/60 hover:text-red-300 transition-all duration-200 hover:scale-110"
          title="Quit"
          onClick={() => window.electronAPI.quitApp()}
        >
          <IoLogOutOutline className="w-4 h-4" />
        </button>
      </div>

      {audioResult && (
        <div className="mt-2 liquid-glass-dark p-3 text-red-100 text-xs max-w-md animate-slide-up">
          <span className="font-semibold text-red-300">Audio:</span> {audioResult}
        </div>
      )}
    </div>
  )
}

export default QueueCommands
