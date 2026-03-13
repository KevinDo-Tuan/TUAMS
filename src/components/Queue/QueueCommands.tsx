import React, { useState, useEffect, useRef } from "react"

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
  const [showLeaveTooltip, setShowLeaveTooltip] = useState(false)

  useEffect(() => {
    let tooltipHeight = 0
    if (tooltipRef.current && isTooltipVisible) {
      tooltipHeight = tooltipRef.current.offsetHeight + 10
    }
    onTooltipVisibilityChange(isTooltipVisible, tooltipHeight)
  }, [isTooltipVisible])

  const handleMouseEnter = () => {
    setIsTooltipVisible(true)
  }

  const handleMouseLeave = () => {
    setIsTooltipVisible(false)
  }

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
            } catch (err) {
              setAudioResult('Audio analysis failed.')
            }
          }
          reader.readAsDataURL(blob)
        }
        setMediaRecorder(recorder)
        recorder.start()
        setIsRecording(true)
      } catch (err) {
        setAudioResult('Could not start recording.')
      }
    } else {
      mediaRecorder?.stop()
      setIsRecording(false)
      setMediaRecorder(null)
    }
  }

  return (
    <div className="w-fit">
      <div className="text-xs text-white/90 liquid-glass-bar py-1 px-4 flex items-center justify-center gap-3 draggable-area">
        {/* Show/Hide */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] leading-none font-medium tracking-wide">Show/Hide</span>
          <div className="flex gap-0.5">
            <span className="bg-white/10 rounded px-1.5 py-0.5 text-[10px] leading-none text-white/60 font-mono">Ctrl</span>
            <span className="bg-white/10 rounded px-1.5 py-0.5 text-[10px] leading-none text-white/60 font-mono">B</span>
          </div>
        </div>

        {/* Solve Command */}
        {screenshots.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] leading-none font-medium tracking-wide">Solve</span>
            <div className="flex gap-0.5">
              <span className="bg-white/10 rounded px-1.5 py-0.5 text-[10px] leading-none text-white/60 font-mono">Ctrl</span>
              <span className="bg-white/10 rounded px-1.5 py-0.5 text-[10px] leading-none text-white/60 font-mono">Enter</span>
            </div>
          </div>
        )}

        {/* Voice Recording Button */}
        <button
          className={`bg-white/10 hover:bg-white/20 transition-colors rounded-md px-2.5 py-1 text-[11px] leading-none text-white/80 font-medium ${isRecording ? 'bg-red-500/60 hover:bg-red-500/80 text-white' : ''}`}
          onClick={handleRecordClick}
          type="button"
        >
          {isRecording ? "Stop" : "Record"}
        </button>

        {/* Chat Button */}
        <button
          className="bg-white/10 hover:bg-white/20 transition-colors rounded-md px-2.5 py-1 text-[11px] leading-none text-white/80 font-medium"
          onClick={onChatToggle}
          type="button"
        >
          Chat
        </button>

        {/* Settings Button */}
        <button
          className="bg-white/10 hover:bg-white/20 transition-colors rounded-md px-2.5 py-1 text-[11px] leading-none text-white/80 font-medium"
          onClick={onSettingsToggle}
          type="button"
        >
          Models
        </button>

        {/* Question mark with tooltip */}
        <div
          className="relative inline-block"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center cursor-help">
            <span className="text-[10px] text-white/60 font-medium">?</span>
          </div>

          {isTooltipVisible && (
            <div
              ref={tooltipRef}
              className="absolute top-full right-0 mt-2 w-72"
            >
              <div className="p-3 text-xs bg-black/85 backdrop-blur-md rounded-lg border border-white/10 text-white/90 shadow-lg">
                <div className="space-y-3">
                  <h3 className="font-semibold text-[11px] tracking-wide text-white/95">Keyboard Shortcuts</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 text-[10px]">Toggle Window</span>
                      <div className="flex gap-0.5">
                        <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] leading-none font-mono">Ctrl</span>
                        <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] leading-none font-mono">B</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 text-[10px]">Take Screenshot</span>
                      <div className="flex gap-0.5">
                        <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] leading-none font-mono">Ctrl</span>
                        <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] leading-none font-mono">H</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 text-[10px]">Solve Problem</span>
                      <div className="flex gap-0.5">
                        <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] leading-none font-mono">Ctrl</span>
                        <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] leading-none font-mono">Enter</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="h-3.5 w-px bg-white/15" />

        {/* Leave Button */}
        <div
          className="relative"
          onMouseEnter={() => setShowLeaveTooltip(true)}
          onMouseLeave={() => setShowLeaveTooltip(false)}
        >
          <button
            className="text-[11px] leading-none text-red-400/70 hover:text-red-400 transition-colors font-medium"
            onClick={() => window.electronAPI.quitApp()}
          >
            Leave
          </button>
          {showLeaveTooltip && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 pointer-events-none">
              <div className="bg-black/90 backdrop-blur-md text-white/90 text-[10px] leading-relaxed px-3 py-2 rounded-lg border border-white/10 shadow-lg text-center">
                Don't press this unless you want to close the app, use Ctrl+B instead
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Audio Result Display */}
      {audioResult && (
        <div className="mt-2 p-2 bg-white/10 rounded text-white text-xs max-w-md">
          <span className="font-semibold">Audio Result:</span> {audioResult}
        </div>
      )}
    </div>
  )
}

export default QueueCommands
