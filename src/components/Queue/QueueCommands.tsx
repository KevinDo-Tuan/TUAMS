import React, { useState, useEffect, useRef } from "react"
import { IoLogOutOutline } from "react-icons/io5"

interface QueueCommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  screenshots: Array<{ path: string; preview: string }>
  onChatToggle: () => void
  onVoiceMessage: (text: string) => void
  onScreenRecordingMessage: (transcript: string, frames: string[]) => void
}

const QueueCommands: React.FC<QueueCommandsProps> = ({
  onTooltipVisibilityChange,
  screenshots,
  onChatToggle,
  onVoiceMessage,
  onScreenRecordingMessage
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Screen + mic recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordStatus, setRecordStatus] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recChunksRef = useRef<Blob[]>([])
  const recStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)
  const framesCapturedRef = useRef<string[]>([])
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Listen mode state (live transcription via Windows Speech Recognition)
  const [isListening, setIsListening] = useState(false)
  const [listenStatus, setListenStatus] = useState<string | null>(null)
  const [listenElapsed, setListenElapsed] = useState(0)
  const listenStreamRef = useRef<MediaStream | null>(null)
  const listenTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let tooltipHeight = 0
    if (tooltipRef.current && isTooltipVisible) {
      tooltipHeight = tooltipRef.current.offsetHeight + 10
    }
    onTooltipVisibilityChange(isTooltipVisible, tooltipHeight)
  }, [isTooltipVisible])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.stop()
      recStreamRef.current?.getTracks().forEach(t => t.stop())
      screenStreamRef.current?.getTracks().forEach(t => t.stop())
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current)
      listenStreamRef.current?.getTracks().forEach(t => t.stop())
      if (listenTimerRef.current) clearInterval(listenTimerRef.current)
    }
  }, [])

  // Helper: convert webm Blob → WAV ArrayBuffer using AudioContext
  const webmToWav = async (blob: Blob): Promise<ArrayBuffer> => {
    const arrayBuffer = await blob.arrayBuffer()
    const audioCtx = new AudioContext()
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    await audioCtx.close()

    // Encode as 16-bit PCM WAV (mono)
    const numChannels = 1
    const sampleRate = audioBuffer.sampleRate
    const samples = audioBuffer.getChannelData(0)
    const numSamples = samples.length
    const wavBuffer = new ArrayBuffer(44 + numSamples * 2)
    const view = new DataView(wavBuffer)

    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
    }

    writeStr(0, "RIFF")
    view.setUint32(4, 36 + numSamples * 2, true)
    writeStr(8, "WAVE")
    writeStr(12, "fmt ")
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true) // PCM
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * numChannels * 2, true)
    view.setUint16(32, numChannels * 2, true)
    view.setUint16(34, 16, true) // bits per sample
    writeStr(36, "data")
    view.setUint32(40, numSamples * 2, true)

    let offset = 44
    for (let i = 0; i < numSamples; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
    return wavBuffer
  }

  // Helper: ArrayBuffer → base64
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer)
    let binary = ""
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  }

  // Helper: transcribe audio blob via main process (Whisper → Windows Speech fallback)
  const transcribeBlob = async (blob: Blob): Promise<string> => {
    const wavBuffer = await webmToWav(blob)
    const base64 = arrayBufferToBase64(wavBuffer)
    const result: { success: boolean; text?: string; error?: string } =
      await window.electronAPI.invoke("transcribe-audio", base64)
    if (result.success && result.text) {
      return result.text
    }
    throw new Error(result.error || "Transcription failed")
  }

  // Capture a frame from a live video element as base64 JPEG
  const captureFrame = (video: HTMLVideoElement): string | null => {
    try {
      if (!video.videoWidth || !video.videoHeight) return null
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 1280 / video.videoWidth)
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.7).replace(/^data:image\/jpeg;base64,/, '')
    } catch {
      return null
    }
  }

  // Format seconds as M:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  // ── Record (screen frames + mic audio → transcribe → send to vision AI) ──
  const handleRecordClick = async () => {
    if (isRecording) {
      // Stop: audio recorder onstop handles everything
      recorderRef.current?.stop()
      return
    }

    try {
      // 1. Get screen source
      const sources = await (window.electronAPI as any).getDesktopSources()
      const screenSource = sources.find((s: any) => s.id.startsWith('screen:'))
      if (!screenSource) {
        setRecordStatus('No screen source found')
        setTimeout(() => setRecordStatus(null), 3000)
        return
      }

      // 2. Get screen video stream (for live frame capture, NOT recording)
      const screenStream = await (navigator.mediaDevices as any).getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: screenSource.id
          }
        }
      })
      screenStreamRef.current = screenStream

      // 3. Set up a hidden video element showing the live screen
      const video = document.createElement('video')
      video.srcObject = screenStream
      video.muted = true
      video.play()
      screenVideoRef.current = video

      // 4. Get mic audio stream and record audio only
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recStreamRef.current = micStream

      recChunksRef.current = []
      framesCapturedRef.current = []

      const recorder = new MediaRecorder(micStream)
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        // Stop frame capture interval
        if (frameIntervalRef.current) {
          clearInterval(frameIntervalRef.current)
          frameIntervalRef.current = null
        }

        // Capture one last frame
        if (screenVideoRef.current) {
          const frame = captureFrame(screenVideoRef.current)
          if (frame && framesCapturedRef.current.length < 30) {
            framesCapturedRef.current.push(frame)
          }
        }

        // Stop streams
        screenStream.getTracks().forEach((t: MediaStreamTrack) => t.stop())
        micStream.getTracks().forEach((t: MediaStreamTrack) => t.stop())
        screenStreamRef.current = null
        recStreamRef.current = null
        screenVideoRef.current = null
        recorderRef.current = null

        const frames = framesCapturedRef.current
        const audioBlob = new Blob(recChunksRef.current, { type: 'audio/webm' })

        if (audioBlob.size === 0 && frames.length === 0) {
          setRecordStatus(null)
          setIsRecording(false)
          return
        }

        setRecordStatus('Transcribing audio...')
        try {
          let transcript = ''
          try {
            if (audioBlob.size > 0) {
              transcript = await transcribeBlob(audioBlob)
            }
          } catch {
            transcript = '(audio transcription unavailable)'
          }

          setRecordStatus('Sending to AI...')
          setIsRecording(false)

          if (frames.length > 0) {
            onScreenRecordingMessage(transcript, frames)
          } else if (transcript.trim()) {
            onVoiceMessage(transcript.trim())
          }
          setRecordStatus(null)
        } catch (err: any) {
          setRecordStatus(`Error: ${err.message}`)
          setIsRecording(false)
          setTimeout(() => setRecordStatus(null), 5000)
        }
      }

      recorder.onerror = () => {
        setRecordStatus('Recording error')
        setIsRecording(false)
        if (frameIntervalRef.current) clearInterval(frameIntervalRef.current)
        screenStream.getTracks().forEach((t: MediaStreamTrack) => t.stop())
        micStream.getTracks().forEach((t: MediaStreamTrack) => t.stop())
        setTimeout(() => setRecordStatus(null), 3000)
      }

      // 5. Start audio recording
      recorder.start()
      setIsRecording(true)
      setRecordStatus('Recording screen + mic...')

      // 6. Capture first frame immediately, then every 5 seconds (max 10)
      const firstFrame = captureFrame(video)
      if (firstFrame) framesCapturedRef.current.push(firstFrame)

      frameIntervalRef.current = setInterval(() => {
        if (framesCapturedRef.current.length >= 30) {
          if (frameIntervalRef.current) clearInterval(frameIntervalRef.current)
          return
        }
        if (screenVideoRef.current) {
          const frame = captureFrame(screenVideoRef.current)
          if (frame) framesCapturedRef.current.push(frame)
        }
      }, 1000)
    } catch (err: any) {
      console.error('Screen recording error:', err)
      setRecordStatus(`Error: ${err.message}`)
      setTimeout(() => setRecordStatus(null), 4000)
    }
  }

  // ── Listen (live transcription via Windows Speech Recognition) ──
  const handleListenClick = async () => {
    if (isListening) {
      // Stop: get accumulated text and send to AI
      if (listenTimerRef.current) {
        clearInterval(listenTimerRef.current)
        listenTimerRef.current = null
      }
      setIsListening(false)

      try {
        const result: { success: boolean; text?: string } =
          await window.electronAPI.invoke("stop-live-transcription")
        const text = result.text?.trim()
        if (text) {
          onVoiceMessage(text)
          setListenStatus(`Sent: ${text}`)
          setTimeout(() => setListenStatus(null), 3000)
        } else {
          setListenStatus("No speech detected")
          setTimeout(() => setListenStatus(null), 3000)
        }
      } catch {
        setListenStatus("Error stopping transcription")
        setTimeout(() => setListenStatus(null), 3000)
      }
      setListenElapsed(0)
      return
    }

    try {
      // Start live transcription in main process
      const startResult: { success: boolean; error?: string } =
        await window.electronAPI.invoke("start-live-transcription")
      if (!startResult.success) {
        setListenStatus(`Error: ${startResult.error}`)
        setTimeout(() => setListenStatus(null), 4000)
        return
      }

      setIsListening(true)
      setListenElapsed(0)
      setListenStatus("Listening...")

      // Listen for live transcript updates
      const cleanup = (window.electronAPI as any).onLiveTranscript((data: { type: string; text: string }) => {
        if (data.text) {
          setListenStatus(data.text)
        }
      })
      listenStreamRef.current = { getTracks: () => [{ stop: cleanup }] } as any

      // Elapsed timer
      listenTimerRef.current = setInterval(() => {
        setListenElapsed(prev => prev + 1)
      }, 1000)
    } catch (err: any) {
      console.error("Live transcription error:", err)
      setListenStatus(`Error: ${err.message}`)
      setTimeout(() => setListenStatus(null), 4000)
    }
  }

  const Kbd = ({ children }: { children: React.ReactNode }) => (
    <span className="kbd-key">{children}</span>
  )

  return (
    <div className="w-fit">
      <div className="text-xs liquid-glass-bar aura py-1 px-3 flex items-center justify-center gap-2.5 draggable-area">

        {/* Show/Hide */}
        <div className="flex items-center gap-1.5 group/cmd">
          <span className="text-[11px] leading-none text-[hsl(0,0%,8%)] font-medium transition-colors duration-200 group-hover/cmd:text-black">
            Show/Hide
          </span>
          <div className="flex gap-0.5">
            <Kbd>Ctrl</Kbd><Kbd>B</Kbd>
          </div>
        </div>

        <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/30 to-transparent" />

        {/* Screenshot */}
        <div className="flex items-center gap-1.5 group/cmd">
          <span className="text-[11px] leading-none text-[hsl(0,0%,8%)] font-medium transition-colors duration-200 group-hover/cmd:text-black">
            Screenshot
          </span>
          <div className="flex gap-0.5">
            <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>H</Kbd>
          </div>
        </div>

        {/* Solve */}
        {screenshots.length > 0 && (
          <>
            <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/30 to-transparent" />
            <div className="flex items-center gap-1.5 group/cmd animate-fade-in">
              <span className="text-[11px] leading-none text-[hsl(0,0%,8%)] font-medium transition-colors duration-200 group-hover/cmd:text-black">
                Solve
              </span>
              <div className="flex gap-0.5">
                <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>Enter</Kbd>
              </div>
            </div>
          </>
        )}

        <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/30 to-transparent" />

        {/* Mic Recording */}
        <button
          className={`glass-btn flex items-center gap-1.5 transition-all duration-300 ${
            isRecording
              ? 'bg-[hsla(0,72%,51%,0.3)] border-[hsla(0,72%,51%,0.4)] text-white animate-glow'
              : ''
          }`}
          onClick={handleRecordClick}
          type="button"
          title="Record screen + voice, sends to vision AI on stop"
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full transition-all duration-300 ${
            isRecording ? 'bg-[hsl(0,72%,60%)] animate-pulse' : 'bg-[hsla(0,72%,60%,0.5)]'
          }`} />
          {isRecording ? 'Stop' : 'Record'}
        </button>

        {/* Listen mode */}
        <button
          className={`glass-btn flex items-center gap-1.5 transition-all duration-300 ${
            isListening
              ? 'bg-[hsla(175,60%,45%,0.3)] border-[hsla(175,60%,45%,0.4)] text-white animate-glow'
              : ''
          }`}
          onClick={handleListenClick}
          type="button"
          title="Listen and show transcript, sends to AI on stop"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
          {isListening ? 'Stop' : 'Listen'}
        </button>

        {/* Chat */}
        <button
          className="glass-btn"
          onClick={onChatToggle}
          type="button"
        >
          Chat
        </button>

        {/* Help toggle */}
        <button
          className="inline-block interactive"
          onClick={() => setIsTooltipVisible(!isTooltipVisible)}
          type="button"
        >
          <div className={`w-5 h-5 rounded-full transition-all duration-200 flex items-center justify-center cursor-pointer border ${
            isTooltipVisible
              ? 'bg-white/15 border-white/15'
              : 'bg-white/8 hover:bg-white/15 border-white/5 hover:border-white/10'
          }`}>
            <span className="text-[10px] text-[hsl(0,0%,12%)]">?</span>
          </div>
        </button>

        <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/30 to-transparent" />

        {/* Quit */}
        <button
          className="text-[hsl(0,0%,15%)] hover:text-[hsl(0,0%,15%)] transition-all duration-200 hover:scale-110"
          title="Quit"
          onClick={() => window.electronAPI.quitApp()}
        >
          <IoLogOutOutline className="w-4 h-4" />
        </button>
      </div>

      {/* Shortcuts panel */}
      {isTooltipVisible && (
        <div ref={tooltipRef} className="mt-2 w-72 z-50 animate-slide-up">
          <div className="p-3.5 text-xs liquid-glass-dark text-[hsl(0,0%,8%)] shadow-2xl">
            <h3 className="font-semibold text-[hsl(0,0%,10%)] mb-3 text-[13px]">Keyboard Shortcuts</h3>
            <div className="space-y-2.5">
              {[
                { label: 'Toggle Window', keys: ['Ctrl', 'B'], desc: 'Show or hide this window' },
                { label: 'Screenshot', keys: ['Ctrl', 'Shift', 'H'], desc: 'Capture current screen' },
                { label: 'Solve', keys: ['Ctrl', 'Shift', 'Enter'], desc: 'Generate solution from screenshots' },
                { label: 'Reset', keys: ['Ctrl', 'Shift', 'R'], desc: 'Clear all screenshots & reset' },
                { label: 'Copy & Ask AI', keys: ['Ctrl', 'Shift', 'K'], desc: 'Copy page text & send to AI' },
                { label: 'Center Window', keys: ['Ctrl', 'Shift', 'Space'], desc: 'Center and show window' },
                { label: 'Move Window', keys: ['Ctrl', 'Shift', 'Arrows'], desc: 'Reposition the window' },
              ].map(({ label, keys, desc }) => (
                <div key={label} className="flex items-start justify-between gap-3 group/item">
                  <div>
                    <div className="font-medium text-[hsl(0,0%,10%)] group-hover/item:text-[hsl(0,0%,8%)] transition-colors duration-200">{label}</div>
                    <div className="text-[10px] text-[hsl(0,0%,30%)] mt-0.5">{desc}</div>
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

      {/* Record status panel */}
      {recordStatus !== null && (
        <div className="mt-2 liquid-glass-dark p-3 text-[hsl(0,0%,8%)] text-xs max-w-md animate-slide-up">
          <span className="font-semibold text-[hsl(0,0%,15%)]">
            {isRecording ? 'Recording...' : recordStatus.startsWith('Error') ? 'Error' : 'Processing'}
          </span>{' '}
          <span className={recordStatus.startsWith('Error') ? 'text-[hsla(0,72%,65%,0.9)]' : 'text-[hsl(0,0%,8%)]/80'}>
            {recordStatus}
          </span>
          {isRecording && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[hsl(0,72%,60%)] animate-pulse" />
              <span className="text-[10px] text-[hsl(0,0%,30%)]">Click Stop to finish recording</span>
            </div>
          )}
        </div>
      )}

      {/* Listen status panel */}
      {listenStatus !== null && (
        <div className="mt-2 liquid-glass-dark p-3 text-[hsl(0,0%,8%)] text-xs max-w-md animate-slide-up">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-semibold text-teal-400">
              {isListening ? 'Listening' : listenStatus.startsWith('Error') ? 'Error' : listenStatus.startsWith('Transcript') ? 'Done' : 'Processing'}
            </span>
            {isListening && (
              <>
                <span className="text-teal-300/70 font-mono text-[11px]">{formatTime(listenElapsed)}</span>
                <span className="inline-flex items-center gap-1">
                  <span className="loading-dot w-1 h-1 rounded-full bg-teal-400 inline-block" />
                  <span className="loading-dot w-1 h-1 rounded-full bg-teal-400 inline-block" />
                  <span className="loading-dot w-1 h-1 rounded-full bg-teal-400 inline-block" />
                </span>
              </>
            )}
          </div>
          <div className={`leading-relaxed ${listenStatus.startsWith('Error') ? 'text-[hsla(0,72%,65%,0.9)]' : 'text-[hsl(0,0%,8%)]/80'}`}>
            {listenStatus}
          </div>
          {isListening && (
            <div className="mt-2 text-[10px] text-[hsl(0,0%,15%)]/40">
              Press Stop to transcribe & send to AI
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default QueueCommands
