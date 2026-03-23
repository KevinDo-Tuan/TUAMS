import React, { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { IoLogOutOutline, IoSunnyOutline, IoMoonOutline } from "react-icons/io5"

interface QueueCommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  screenshots: Array<{ path: string; preview: string }>
  onChatToggle: () => void
  onVoiceMessage: (text: string, prompt?: string) => void
  onScreenRecordingMessage: (transcript: string, frames: string[]) => void
  actionBarPortalId?: string
  shortcutsBarPortalId?: string
  meetingContext?: string
  onAutoScreenshot?: (base64: string) => void
  onLiveAiUpdate?: (suggestion: string) => void
  onListenStateChange?: (listening: boolean) => void
  onHelpToggle?: (active: boolean) => void
  isHelpMode?: boolean
}

const QueueCommands: React.FC<QueueCommandsProps> = ({
  onTooltipVisibilityChange,
  screenshots,
  onChatToggle,
  onVoiceMessage,
  onScreenRecordingMessage,
  actionBarPortalId,
  shortcutsBarPortalId,
  meetingContext,
  onAutoScreenshot,
  onLiveAiUpdate,
  onListenStateChange,
  onHelpToggle,
  isHelpMode,
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Screen + mic recording state
  const [isRecording, setIsRecording] = useState(false)
  const isRecordingRef = useRef(false)
  const [recordStatus, setRecordStatus] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recChunksRef = useRef<Blob[]>([])
  const recStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)
  const framesCapturedRef = useRef<string[]>([])
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Listen mode state
  const [isListening, setIsListening] = useState(false)
  const isListeningRef = useRef(false)
  const [listenStatus, setListenStatus] = useState<string | null>(null)
  const [listenElapsed, setListenElapsed] = useState(0)
  const listenTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const listenAudioCtxRef = useRef<AudioContext | null>(null)
  const listenSystemStreamRef = useRef<MediaStream | null>(null)
  const listenMicStreamRef = useRef<MediaStream | null>(null)
  const listenProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const listenRecorderRef = useRef<MediaRecorder | null>(null)
  const listenTranscriptRef = useRef<string>("")
  const listenStoppingRef = useRef<boolean>(false)
  const listenEngineRef = useRef<"sherpa" | "vosk" | "chunked" | null>(null)
  const listenCleanupRef = useRef<(() => void) | null>(null)
  const voskRecognizerRef = useRef<any>(null)

  // Keep meetingContext in a ref so the live AI interval always reads the latest value
  const meetingContextRef = useRef(meetingContext)
  useEffect(() => { meetingContextRef.current = meetingContext })

  // Live AI suggestion state (streams during listen mode)
  const [liveAiSuggestion, setLiveAiSuggestion] = useState<string | null>(null)
  const [liveAiLoading, setLiveAiLoading] = useState(false)
  const liveAiIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSentTranscriptRef = useRef<string>("")
  const liveAiAbortRef = useRef<boolean>(false)
  const liveAiInFlightRef = useRef<boolean>(false)
  const liveAiStreamCleanupRef = useRef<(() => void) | null>(null)

  // Auto-screenshot state (record mode only)
  const autoScreenshotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Listen prompt suggestions
  const LISTEN_SUGGESTIONS = [
    { label: "What should I say?", icon: "" },
    { label: "Follow-up questions", icon: "" },
    { label: "Summarize", icon: "" },
  ]
  const [customPrompt, setCustomPrompt] = useState("")
  const listenPromptRef = useRef<string | null>(null)


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
      // Listen cleanup
      if (listenProcessorRef.current) {
        try { listenProcessorRef.current.disconnect() } catch {}
      }
      if (listenRecorderRef.current && listenRecorderRef.current.state !== 'inactive') {
        try { listenRecorderRef.current.stop() } catch {}
      }
      listenSystemStreamRef.current?.getTracks().forEach(t => t.stop())
      listenMicStreamRef.current?.getTracks().forEach(t => t.stop())
      if (listenAudioCtxRef.current && listenAudioCtxRef.current.state !== 'closed') {
        try { listenAudioCtxRef.current.close() } catch {}
      }
      if (listenTimerRef.current) clearInterval(listenTimerRef.current)
      if (listenCleanupRef.current) listenCleanupRef.current()
      // Live AI + auto-screenshot cleanup
      if (liveAiIntervalRef.current) clearInterval(liveAiIntervalRef.current)
      liveAiAbortRef.current = true
      if (liveAiStreamCleanupRef.current) liveAiStreamCleanupRef.current()
      if (autoScreenshotIntervalRef.current) clearInterval(autoScreenshotIntervalRef.current)
    }
  }, [])

  // Keep refs to latest handlers so IPC listeners never go stale
  const handleRecordRef = useRef<(() => void) | null>(null)
  const handleListenRef = useRef<(() => void) | null>(null)
  const handleChatRef = useRef<(() => void) | null>(null)
  useEffect(() => { handleRecordRef.current = handleRecordClick })
  useEffect(() => { handleListenRef.current = handleListenClick })
  useEffect(() => { handleChatRef.current = onChatToggle })

  // Listen for global shortcut IPC events (registered once, uses refs)
  useEffect(() => {
    const api = window.electronAPI as any
    const cleanups: (() => void)[] = []
    if (api.onToggleRecord) cleanups.push(api.onToggleRecord(() => handleRecordRef.current?.()))
    if (api.onToggleListen) cleanups.push(api.onToggleListen(() => handleListenRef.current?.()))
    if (api.onToggleChat) cleanups.push(api.onToggleChat(() => handleChatRef.current?.()))
    return () => cleanups.forEach(c => c())
  }, [])

  // Helper: ArrayBuffer → base64 (chunked to avoid call stack limits)
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer)
    const CHUNK = 0x8000
    const parts: string[] = []
    for (let i = 0; i < bytes.length; i += CHUNK) {
      parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)))
    }
    return btoa(parts.join(''))
  }

  // Helper: transcribe audio blob via main process (sends webm directly — no conversion)
  const transcribeBlob = async (blob: Blob): Promise<string> => {
    const buffer = await blob.arrayBuffer()
    const base64 = arrayBufferToBase64(buffer)
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
    if (isRecordingRef.current) {
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

      // 2. Get screen video + system audio stream
      const screenStream = await (navigator.mediaDevices as any).getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: screenSource.id
          }
        },
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

      // 4. Get mic audio + mix with system audio
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recStreamRef.current = micStream

      // Mix system + mic audio via AudioContext
      const recAudioCtx = new AudioContext()
      const recDest = recAudioCtx.createMediaStreamDestination()
      if (screenStream.getAudioTracks().length > 0) {
        recAudioCtx.createMediaStreamSource(screenStream).connect(recDest)
      }
      recAudioCtx.createMediaStreamSource(micStream).connect(recDest)

      recChunksRef.current = []
      framesCapturedRef.current = []

      const recorder = new MediaRecorder(recDest.stream)
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
        // Stop auto-screenshot interval
        if (autoScreenshotIntervalRef.current) {
          clearInterval(autoScreenshotIntervalRef.current)
          autoScreenshotIntervalRef.current = null
        }

        // Capture one last frame
        if (screenVideoRef.current) {
          const frame = captureFrame(screenVideoRef.current)
          if (frame && framesCapturedRef.current.length < 30) {
            framesCapturedRef.current.push(frame)
          }
        }

        // Stop streams and close AudioContext
        screenStream.getTracks().forEach((t: MediaStreamTrack) => t.stop())
        micStream.getTracks().forEach((t: MediaStreamTrack) => t.stop())
        try { recAudioCtx.close() } catch {}
        screenStreamRef.current = null
        recStreamRef.current = null
        screenVideoRef.current = null
        recorderRef.current = null

        const frames = framesCapturedRef.current
        const audioBlob = new Blob(recChunksRef.current, { type: 'audio/webm' })

        if (audioBlob.size === 0 && frames.length === 0) {
          setRecordStatus(null)
          isRecordingRef.current = false
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
          isRecordingRef.current = false
          setIsRecording(false)

          if (frames.length > 0) {
            onScreenRecordingMessage(transcript, frames)
          } else if (transcript.trim()) {
            onVoiceMessage(transcript.trim())
          }
          setRecordStatus(null)
        } catch (err: any) {
          setRecordStatus(`Error: ${err.message}`)
          isRecordingRef.current = false
          setIsRecording(false)
          setTimeout(() => setRecordStatus(null), 5000)
        }
      }

      recorder.onerror = () => {
        setRecordStatus('Recording error')
        isRecordingRef.current = false
        setIsRecording(false)
        if (frameIntervalRef.current) clearInterval(frameIntervalRef.current)
        screenStream.getTracks().forEach((t: MediaStreamTrack) => t.stop())
        micStream.getTracks().forEach((t: MediaStreamTrack) => t.stop())
        try { recAudioCtx.close() } catch {}
        setTimeout(() => setRecordStatus(null), 3000)
      }

      // 5. Start audio recording
      recorder.start()
      isRecordingRef.current = true
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

      // Auto-screenshot every 15s for visual context (record mode only)
      autoScreenshotIntervalRef.current = setInterval(async () => {
        try {
          const result = await window.electronAPI.invoke("auto-capture-screen")
          if (result?.success && result.base64 && onAutoScreenshot) {
            onAutoScreenshot(result.base64)
          }
        } catch (err) {
          console.error("[AutoScreenshot] Error:", err)
        }
      }, 15000)
    } catch (err: any) {
      console.error('Screen recording error:', err)
      setRecordStatus(`Error: ${err.message}`)
      setTimeout(() => setRecordStatus(null), 4000)
    }
  }

  // ── Listen (system audio + mic → streaming STT with fallback chain) ──
  const stopListenStreams = () => {
    if (listenProcessorRef.current) {
      try { listenProcessorRef.current.disconnect() } catch {}
      listenProcessorRef.current = null
    }
    if (listenRecorderRef.current && listenRecorderRef.current.state !== 'inactive') {
      try { listenRecorderRef.current.stop() } catch {}
    }
    listenRecorderRef.current = null
    listenSystemStreamRef.current?.getTracks().forEach(t => t.stop())
    listenSystemStreamRef.current = null
    listenMicStreamRef.current?.getTracks().forEach(t => t.stop())
    listenMicStreamRef.current = null
    if (listenAudioCtxRef.current && listenAudioCtxRef.current.state !== 'closed') {
      try { listenAudioCtxRef.current.close() } catch {}
    }
    listenAudioCtxRef.current = null
    if (listenTimerRef.current) {
      clearInterval(listenTimerRef.current)
      listenTimerRef.current = null
    }
    if (listenCleanupRef.current) {
      listenCleanupRef.current()
      listenCleanupRef.current = null
    }
    if (voskRecognizerRef.current) {
      try { voskRecognizerRef.current.remove() } catch {}
      voskRecognizerRef.current = null
    }
  }

  // Capture system audio + mic, return mixed AudioContext destination
  const captureAudioStreams = async () => {
    // Run desktop source enumeration + mic capture in parallel
    const [sources, micStream] = await Promise.all([
      (window.electronAPI as any).getDesktopSources(),
      navigator.mediaDevices.getUserMedia({ audio: true })
    ])
    listenMicStreamRef.current = micStream

    const screenSource = sources.find((s: any) => s.id.startsWith('screen:'))
    if (!screenSource) throw new Error('No screen source found')

    const systemStream = await (navigator.mediaDevices as any).getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: screenSource.id } },
      video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: screenSource.id } }
    })
    systemStream.getVideoTracks().forEach((t: MediaStreamTrack) => t.stop())
    listenSystemStreamRef.current = systemStream

    const audioCtx = new AudioContext()
    listenAudioCtxRef.current = audioCtx
    const dest = audioCtx.createMediaStreamDestination()
    if (systemStream.getAudioTracks().length > 0) {
      audioCtx.createMediaStreamSource(systemStream).connect(dest)
    }
    audioCtx.createMediaStreamSource(micStream).connect(dest)

    return { audioCtx, dest }
  }

  // Create a ScriptProcessorNode that extracts float32 PCM at 16kHz
  const createPcmProcessor = (
    audioCtx: AudioContext,
    dest: MediaStreamAudioDestinationNode,
    onPcmChunk: (float32: Float32Array) => void
  ) => {
    const processor = audioCtx.createScriptProcessor(4096, 1, 1)
    listenProcessorRef.current = processor
    const mixedSource = audioCtx.createMediaStreamSource(dest.stream)
    mixedSource.connect(processor)
    processor.connect(audioCtx.destination) // must be connected to stay alive

    const srcRate = audioCtx.sampleRate
    const targetRate = 16000

    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      const input = e.inputBuffer.getChannelData(0)
      const ratio = srcRate / targetRate
      const newLen = Math.floor(input.length / ratio)
      const downsampled = new Float32Array(newLen)
      for (let i = 0; i < newLen; i++) {
        downsampled[i] = input[Math.floor(i * ratio)]
      }
      onPcmChunk(downsampled)
    }
  }

  // Convert Float32Array to base64
  const float32ToBase64 = (f32: Float32Array): string => {
    const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength)
    let binary = ""
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  }

  // ── Strategy A: sherpa-onnx (main process, true streaming) ──
  // Note: sherpa is pre-initialized in handleListenClick parallel flow
  const startSherpaListen = async (
    audioCtx: AudioContext,
    dest: MediaStreamAudioDestinationNode
  ): Promise<boolean> => {
    try {

      // Listen for live-transcript events from main process
      const cleanup = (window.electronAPI as any).onLiveTranscript((data: { type: string; text: string }) => {
        if (data.text) {
          listenTranscriptRef.current = data.text
          setListenStatus(data.text)
        }
      })
      listenCleanupRef.current = cleanup

      // Feed PCM to main process
      createPcmProcessor(audioCtx, dest, (float32) => {
        const base64 = float32ToBase64(float32)
        window.electronAPI.invoke("stt-feed-audio", base64)
      })

      listenEngineRef.current = "sherpa"
      console.log("[Listen] Using sherpa-onnx engine")
      return true
    } catch (err: any) {
      console.log("[Listen] sherpa-onnx failed:", err.message)
      return false
    }
  }

  // ── Strategy B: vosk-browser (WASM in renderer, true streaming) ──
  const startVoskListen = async (
    audioCtx: AudioContext,
    dest: MediaStreamAudioDestinationNode
  ): Promise<boolean> => {
    try {
      const Vosk = await import("vosk-browser")

      // Check & download model files (should already be downloaded at startup)
      const check: { downloaded: boolean } = await window.electronAPI.invoke("stt-check-vosk")
      if (!check.downloaded) {
        const dl: { success: boolean; error?: string } = await window.electronAPI.invoke("stt-download-vosk")
        if (!dl.success) throw new Error(dl.error || "Download failed")
      }

      // Get model tar.gz from main process
      setListenStatus("Loading vosk model...")
      const tarResult: { success: boolean; data?: string; error?: string } =
        await window.electronAPI.invoke("stt-get-vosk-targz")
      if (!tarResult.success || !tarResult.data) throw new Error(tarResult.error || "No tar.gz data")

      // Create blob URL from base64
      const tarBytes = Uint8Array.from(atob(tarResult.data), c => c.charCodeAt(0))
      const blob = new Blob([tarBytes], { type: "application/gzip" })
      const modelUrl = URL.createObjectURL(blob)

      // Create vosk model and recognizer
      const model = await (Vosk as any).createModel(modelUrl)
      URL.revokeObjectURL(modelUrl)

      const recognizer = new model.KaldiRecognizer(16000)
      recognizer.setWords(true)
      voskRecognizerRef.current = recognizer

      // Listen for partial and final results
      recognizer.on("result", (message: any) => {
        const text = message.result?.text
        if (text && text.trim()) {
          listenTranscriptRef.current += (listenTranscriptRef.current ? " " : "") + text.trim()
          setListenStatus(listenTranscriptRef.current)
        }
      })
      recognizer.on("partialresult", (message: any) => {
        const partial = message.result?.partial
        if (partial && partial.trim()) {
          const display = listenTranscriptRef.current
            ? listenTranscriptRef.current + " " + partial.trim()
            : partial.trim()
          setListenStatus(display)
        }
      })

      // Feed PCM to vosk recognizer
      createPcmProcessor(audioCtx, dest, (float32) => {
        try {
          // vosk-browser expects AudioBuffer or acceptWaveformFloat
          recognizer.acceptWaveformFloat(float32, 16000)
        } catch {}
      })

      listenEngineRef.current = "vosk"
      console.log("[Listen] Using vosk-browser engine")
      return true
    } catch (err: any) {
      console.log("[Listen] vosk-browser failed:", err.message)
      return false
    }
  }

  // ── Strategy C: chunked transcription fallback ──
  const startChunkedListen = (
    dest: MediaStreamAudioDestinationNode
  ): boolean => {
    listenTranscriptRef.current = ""
    listenStoppingRef.current = false

    const pendingChunks: Blob[] = []
    let isTranscribing = false

    const transcribePending = async () => {
      if (pendingChunks.length === 0 || isTranscribing) return
      isTranscribing = true
      const batch = pendingChunks.splice(0, pendingChunks.length)
      const combined = new Blob(batch, { type: batch[0]?.type || 'audio/webm' })
      try {
        const text = await transcribeBlob(combined)
        if (text && text.trim()) {
          listenTranscriptRef.current += (listenTranscriptRef.current ? " " : "") + text.trim()
          setListenStatus(listenTranscriptRef.current)
        }
      } catch (err) {
        console.log("[Listen] Chunk transcription failed:", err)
      }
      isTranscribing = false
      if (listenStoppingRef.current) {
        if (pendingChunks.length > 0) { await transcribePending(); return }
        stopListenStreams()
        setListenStatus("Stopped")
        setTimeout(() => setListenStatus(null), 3000)
        setListenElapsed(0)
        listenStoppingRef.current = false
        return
      }
      if (pendingChunks.length > 0) transcribePending()
    }

    const recorder = new MediaRecorder(dest.stream)
    listenRecorderRef.current = recorder
    recorder.ondataavailable = (e) => {
      if (e.data.size === 0) return
      pendingChunks.push(e.data)
      transcribePending()
    }
    recorder.onerror = () => {
      setListenStatus('Recording error')
      setIsListening(false)
      stopListenStreams()
      setTimeout(() => setListenStatus(null), 3000)
    }
    recorder.start(3000) // 3-second chunks for better recognition
    listenEngineRef.current = "chunked"
    console.log("[Listen] Using chunked transcription fallback")
    return true
  }

  // Stop listening and send transcript with an optional prompt
  const stopListenAndSend = async () => {
    if (!isListeningRef.current) return
    isListeningRef.current = false
    setIsListening(false)
    onListenStateChange?.(false)

    // Clean up live AI interval + stream listener
    liveAiAbortRef.current = true
    if (liveAiIntervalRef.current) {
      clearInterval(liveAiIntervalRef.current)
      liveAiIntervalRef.current = null
    }
    if (liveAiStreamCleanupRef.current) {
      liveAiStreamCleanupRef.current()
      liveAiStreamCleanupRef.current = null
    }
    setLiveAiSuggestion(null)
    setLiveAiLoading(false)
    lastSentTranscriptRef.current = ""

    const engine = listenEngineRef.current

    if (engine === "sherpa") {
      stopListenStreams()
      try {
        await window.electronAPI.invoke("stt-stop-sherpa")
        setListenStatus("Stopped")
      } catch { setListenStatus("Error stopping") }
      setTimeout(() => setListenStatus(null), 3000)
      setListenElapsed(0)
    } else if (engine === "vosk") {
      if (voskRecognizerRef.current) {
        try { voskRecognizerRef.current.retrieveFinalResult() } catch {}
      }
      await new Promise(r => setTimeout(r, 200))
      stopListenStreams()
      setListenStatus("Stopped")
      setTimeout(() => setListenStatus(null), 3000)
      setListenElapsed(0)
    } else if (engine === "chunked") {
      listenStoppingRef.current = true
      if (listenRecorderRef.current && listenRecorderRef.current.state !== 'inactive') {
        listenRecorderRef.current.stop()
      } else {
        stopListenStreams()
        setListenStatus("Stopped")
        setTimeout(() => setListenStatus(null), 3000)
        setListenElapsed(0)
        listenStoppingRef.current = false
      }
    }
    listenEngineRef.current = null
  }

  const handleListenClick = async () => {
    if (isListeningRef.current) {
      await stopListenAndSend()
      return
    }

    // ── Start ──
    try {
      setListenStatus("Initializing...")
      listenTranscriptRef.current = ""
      listenPromptRef.current = null
      setCustomPrompt("")

      // Pre-init sherpa in parallel with audio capture for faster startup
      const [audioResult, sherpaPreInit] = await Promise.all([
        captureAudioStreams(),
        window.electronAPI.invoke("stt-init-sherpa").catch(() => ({ success: false }))
      ])
      const { audioCtx, dest } = audioResult

      // Try engines in order: sherpa-onnx → vosk-browser → chunked
      let started = false
      if (sherpaPreInit.success) {
        started = await startSherpaListen(audioCtx, dest)
      }
      if (!started) {
        started = await startVoskListen(audioCtx, dest)
      }
      if (!started) {
        started = startChunkedListen(dest)
      }

      if (!started) {
        stopListenStreams()
        setListenStatus("No speech engine available")
        setTimeout(() => setListenStatus(null), 4000)
        return
      }

      isListeningRef.current = true
      setIsListening(true)
      onListenStateChange?.(true)
      setListenElapsed(0)
      if (listenEngineRef.current !== "chunked") {
        setListenStatus("Listening...")
      }

      listenTimerRef.current = setInterval(() => {
        setListenElapsed(prev => prev + 1)
      }, 1000)

      // Start live AI suggestions (every 2s) with streaming
      lastSentTranscriptRef.current = ""
      liveAiAbortRef.current = false
      setLiveAiSuggestion(null)
      liveAiInFlightRef.current = false

      // Listen for streaming tokens from main process
      const cleanupStreamListener = window.electronAPI.onAiStreamToken((text: string) => {
        if (!liveAiAbortRef.current) {
          setLiveAiSuggestion(text)
        }
      })
      liveAiStreamCleanupRef.current = cleanupStreamListener

      liveAiIntervalRef.current = setInterval(async () => {
        const transcript = listenTranscriptRef.current.trim()
        if (!transcript || transcript.length < 20) return
        if (transcript === lastSentTranscriptRef.current) return
        if (liveAiAbortRef.current) return
        if (liveAiInFlightRef.current) return

        lastSentTranscriptRef.current = transcript
        liveAiInFlightRef.current = true
        setLiveAiLoading(true)

        try {
          const context = meetingContextRef.current || ""
          const recentTranscript = transcript.length > 500 ? transcript.slice(-500) : transcript
          const prompt = `Real-time meeting copilot. Brief actionable coaching (2-3 sentences, no markdown).${context ? `\nContext: ${context.slice(-300)}` : ""}\nTranscript: "${recentTranscript}"`

          console.log("[LiveAI] Sending to ai-chat-stream, transcript length:", recentTranscript.length)
          const response = await window.electronAPI.invoke("ai-chat-stream", prompt)
          console.log("[LiveAI] Stream complete, response length:", response?.length)
          if (!liveAiAbortRef.current) {
            setLiveAiSuggestion(response)
            onLiveAiUpdate?.(response)
          }
        } catch (err) {
          console.error("[LiveAI] Stream error:", err)
        } finally {
          liveAiInFlightRef.current = false
          if (!liveAiAbortRef.current) setLiveAiLoading(false)
        }
      }, 2000)

    } catch (err: any) {
      console.error("Listen error:", err)
      stopListenStreams()
      setListenStatus(`Error: ${err.message}`)
      setTimeout(() => setListenStatus(null), 4000)
    }
  }

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  const Kbd = ({ children }: { children: React.ReactNode }) => (
    <span className="kbd-key">{children}</span>
  )

  const shortcutsBarContent = (
    <div className="text-xs liquid-glass-bar aura py-0.5 px-2 flex items-center justify-center gap-2 draggable-area w-fit mx-auto">
      {/* Show/Hide */}
      <div className="flex items-center gap-1.5 group/cmd">
        <span className="cmd-label text-[11px] leading-none text-[hsla(0, 2%, 10%, 0.00)] font-medium transition-colors duration-200 group-hover/cmd:text-black">
          Show/Hide
        </span>
        <div className="flex gap-0.5">
          <Kbd>Ctrl</Kbd><Kbd>B</Kbd>
        </div>
      </div>

      <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/30 to-transparent" />

      {/* Stealth Mode */}
      <div className="flex items-center gap-1.5 group/cmd">
        <span className="cmd-label text-[11px] leading-none text-[hsl(0,0%,8%)] font-medium transition-colors duration-200 group-hover/cmd:text-black">
          Stealth
        </span>
        <div className="flex gap-0.5">
          <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>G</Kbd>
        </div>
      </div>

      <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/30 to-transparent" />

      {/* Screenshot */}
      <div className="flex items-center gap-1.5 group/cmd">
        <span className="cmd-label text-[11px] leading-none text-[hsl(0,0%,8%)] font-medium transition-colors duration-200 group-hover/cmd:text-black">
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
            <span className="cmd-label text-[11px] leading-none text-[hsl(0,0%,8%)] font-medium transition-colors duration-200 group-hover/cmd:text-black">
              Solve
            </span>
            <div className="flex gap-0.5">
              <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>Enter</Kbd>
            </div>
          </div>
        </>
      )}
    </div>
  )

  const actionBarContent = (
    <div className="text-xs liquid-glass-bar py-0.5 px-2 flex items-center justify-center gap-2 w-fit mx-auto draggable-area">
      {/* Record */}
      <div className="flex items-center gap-1 group/cmd">
        <button
          className={`glass-btn glass-btn-record flex items-center gap-1.5 transition-all duration-300 ${
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
        {!isRecording && (
          <div className="flex gap-0.5">
            <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>O</Kbd>
          </div>
        )}
      </div>

      <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/30 to-transparent" />

      {/* Listen */}
      <div className="flex items-center gap-1 group/cmd">
        <button
          className={`glass-btn flex items-center gap-1.5 transition-all duration-300 ${
            isListening
              ? 'bg-[hsla(175,60%,45%,0.3)] border-[hsla(175,60%,45%,0.4)] text-white animate-glow'
              : ''
          }`}
          onClick={handleListenClick}
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
          {isListening ? 'Stop' : 'Listen'}
        </button>
        {!isListening && (
          <div className="flex gap-0.5">
            <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>J</Kbd>
          </div>
        )}
      </div>

      <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/30 to-transparent" />

      {/* Chat */}
      <div className="flex items-center gap-1 group/cmd">
        <button
          className="glass-btn flex items-center gap-1.5"
          onClick={onChatToggle}
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          Chat
        </button>
        <div className="flex gap-0.5">
          <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>C</Kbd>
        </div>
      </div>

      <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/30 to-transparent" />

      {/* Theme toggle */}
      <button
        className="w-5 h-5 rounded-full bg-white/8 hover:bg-white/15 transition-all duration-200 flex items-center justify-center border border-white/5 hover:border-white/10 interactive"
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        onClick={toggleTheme}
        type="button"
      >
        {isDark ? (
          <IoSunnyOutline className="w-3 h-3 bar-icon" />
        ) : (
          <IoMoonOutline className="w-3 h-3 bar-icon" />
        )}
      </button>

      {/* Help toggle */}
      <button
        className="inline-block interactive"
        onClick={() => {
          const newState = !isHelpMode
          if (newState && isListeningRef.current) {
            stopListenAndSend()
          }
          setIsTooltipVisible(newState)
          onHelpToggle?.(newState)
        }}
        type="button"
      >
        <div className={`w-5 h-5 rounded-full transition-all duration-200 flex items-center justify-center cursor-pointer border ${
          isHelpMode
            ? 'bg-white/15 border-white/15'
            : 'bg-white/8 hover:bg-white/15 border-white/5 hover:border-white/10'
        }`}>
          <span className="text-[10px] bar-icon">?</span>
        </div>
      </button>

      {/* Quit */}
      <button
        className="bar-icon transition-all duration-200 hover:scale-110"
        title="Quit"
        onClick={() => window.electronAPI.quitApp()}
      >
        <IoLogOutOutline className="w-4 h-4" />
      </button>
    </div>
  )

  return (
    <>
      {/* Action bar → top portal */}
      {actionBarPortalId && document.getElementById(actionBarPortalId) &&
        createPortal(actionBarContent, document.getElementById(actionBarPortalId)!)}

      {/* Shortcuts bar → bottom portal (hidden in help mode) */}
      {!isHelpMode && shortcutsBarPortalId && document.getElementById(shortcutsBarPortalId) &&
        createPortal(shortcutsBarContent, document.getElementById(shortcutsBarPortalId)!)}

      {/* Shortcuts help panel — only as floating overlay when NOT in help mode */}
      {isTooltipVisible && !isHelpMode && shortcutsBarPortalId && document.getElementById(shortcutsBarPortalId) && createPortal(
        <div ref={tooltipRef} className="mb-2 w-72 z-50 animate-slide-up mx-auto">
          <div className="p-3.5 text-xs liquid-glass-dark text-[hsl(0,0%,8%)] shadow-2xl">
            <h3 className="font-semibold text-[hsl(0,0%,10%)] mb-3 text-[13px]">Keyboard Shortcuts</h3>
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
        </div>,
        document.getElementById(shortcutsBarPortalId)!
      )}

      {/* Record status panel — improved */}
      {recordStatus !== null && actionBarPortalId && document.getElementById(actionBarPortalId) && createPortal(
        <div className="mt-1 listen-panel liquid-glass-dark p-0 text-[hsl(0,0%,8%)] text-xs animate-slide-up mx-auto w-fit min-w-[280px] overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <div className="flex items-center gap-2.5">
              {isRecording && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
              )}
              <span className="font-semibold text-[13px] text-red-500">
                {isRecording ? 'Recording' : recordStatus.startsWith('Error') ? 'Error' : 'Processing'}
              </span>
            </div>
            {isRecording && (
              <button
                onClick={() => recorderRef.current?.stop()}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-all"
              >
                Stop
              </button>
            )}
          </div>
          <div className="px-3.5 pb-2.5">
            <div className={`text-[12px] leading-relaxed ${recordStatus.startsWith('Error') ? 'text-red-500' : 'text-[hsl(0,0%,30%)] dark:text-[hsl(0,0%,70%)]'}`}>
              {recordStatus}
            </div>
            {isRecording && (
              <div className="mt-1.5 text-[10px] text-[hsl(0,0%,40%)] dark:text-[hsl(0,0%,55%)]">
                Auto-capturing screen every 15s for context
              </div>
            )}
          </div>
        </div>,
        document.getElementById(actionBarPortalId)!
      )}

      {/* Listen status panel — redesigned with live AI suggestions */}
      {listenStatus !== null && actionBarPortalId && document.getElementById(actionBarPortalId) && createPortal(
        <div className="mt-1 listen-panel liquid-glass-dark p-0 text-[hsl(0,0%,8%)] text-xs animate-slide-up mx-auto w-fit min-w-[360px] max-w-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3.5 py-2 border-b border-white/8">
            <div className="flex items-center gap-2.5">
              {isListening && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500" />
                </span>
              )}
              <span className="font-semibold text-[13px] text-teal-500 dark:text-teal-400">
                {isListening ? 'Listening' : listenStatus.startsWith('Error') ? 'Error' : listenStatus.startsWith('Transcript') ? 'Done' : 'Processing'}
              </span>
              {isListening && (
                <span className="text-teal-400/60 font-mono text-[12px] tabular-nums">{formatTime(listenElapsed)}</span>
              )}
            </div>
            {isListening && (
              <button
                onClick={() => stopListenAndSend()}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-all"
              >
                Stop
              </button>
            )}
          </div>

          {/* Transcript area */}
          <div className="px-3.5 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(0,0%,40%)] dark:text-[hsl(0,0%,60%)] mb-1">Transcript</div>
            <div className={`text-[13px] leading-relaxed max-h-[80px] overflow-y-auto ${listenStatus.startsWith('Error') ? 'text-red-500' : 'text-[hsl(0,0%,15%)] dark:text-[hsl(0,0%,85%)]'}`}>
              {listenStatus || "Waiting for speech..."}
            </div>
          </div>

          {/* Live AI Suggestion */}
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
              {liveAiSuggestion && (
                <div className="text-[13px] leading-relaxed text-[hsl(0,0%,12%)] dark:text-[hsl(0,0%,88%)] max-h-[80px] overflow-y-auto">
                  {liveAiSuggestion}
                </div>
              )}
            </div>
          )}

          {/* Quick actions */}
          {isListening && (
            <div className="px-3.5 py-2.5 border-t border-white/8">
              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                {LISTEN_SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => stopListenAndSend()}
                    className="listen-suggestion-btn px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/8 dark:bg-white/6 text-[hsl(0,0%,30%)] dark:text-[hsl(0,0%,70%)] hover:bg-indigo-500 hover:text-white transition-all cursor-pointer border border-white/10 hover:border-indigo-500"
                  >
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customPrompt.trim()) {
                    stopListenAndSend()
                  }
                }}
                placeholder="Ask anything about the conversation..."
                className="w-full px-3 py-2 rounded-lg bg-white/8 dark:bg-white/6 text-[12px] text-[hsl(0,0%,15%)] dark:text-[hsl(0,0%,85%)] placeholder-[hsl(0,0%,40%)] dark:placeholder-[hsl(0,0%,55%)] outline-none focus:bg-white/15 dark:focus:bg-white/10 transition-colors border border-white/8 focus:border-indigo-400/30"
              />
            </div>
          )}
        </div>,
        document.getElementById(actionBarPortalId)!
      )}
    </>
  )
}

export default QueueCommands
