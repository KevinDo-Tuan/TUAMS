import React, { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { IoLogOutOutline, IoSunnyOutline, IoMoonOutline } from "react-icons/io5"

interface QueueCommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  screenshots: Array<{ path: string; preview: string }>
  onChatToggle: () => void
  onVoiceMessage: (text: string) => void
  onScreenRecordingMessage: (transcript: string, frames: string[]) => void
  actionBarPortalId?: string
  shortcutsBarPortalId?: string
}

const QueueCommands: React.FC<QueueCommandsProps> = ({
  onTooltipVisibilityChange,
  screenshots,
  onChatToggle,
  onVoiceMessage,
  onScreenRecordingMessage,
  actionBarPortalId,
  shortcutsBarPortalId
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
        const finalText = listenTranscriptRef.current.trim()
        stopListenStreams()
        if (finalText) { onVoiceMessage(finalText); setListenStatus("Sent transcript") }
        else { setListenStatus("No speech detected") }
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

  const handleListenClick = async () => {
    if (isListeningRef.current) {
      // ── Stop ──
      isListeningRef.current = false
      setIsListening(false)
      const engine = listenEngineRef.current

      if (engine === "sherpa") {
        stopListenStreams()
        try {
          const result: { success: boolean; text?: string } =
            await window.electronAPI.invoke("stt-stop-sherpa")
          const text = (result.text || listenTranscriptRef.current).trim()
          if (text) { onVoiceMessage(text); setListenStatus("Sent transcript") }
          else { setListenStatus("No speech detected") }
        } catch { setListenStatus("Error stopping") }
        setTimeout(() => setListenStatus(null), 3000)
        setListenElapsed(0)
      } else if (engine === "vosk") {
        // Flush final result from vosk
        if (voskRecognizerRef.current) {
          try { voskRecognizerRef.current.retrieveFinalResult() } catch {}
        }
        // Small delay for final event to arrive
        await new Promise(r => setTimeout(r, 200))
        const text = listenTranscriptRef.current.trim()
        stopListenStreams()
        if (text) { onVoiceMessage(text); setListenStatus("Sent transcript") }
        else { setListenStatus("No speech detected") }
        setTimeout(() => setListenStatus(null), 3000)
        setListenElapsed(0)
      } else if (engine === "chunked") {
        listenStoppingRef.current = true
        if (listenRecorderRef.current && listenRecorderRef.current.state !== 'inactive') {
          listenRecorderRef.current.stop()
        } else {
          const text = listenTranscriptRef.current.trim()
          stopListenStreams()
          if (text) { onVoiceMessage(text); setListenStatus("Sent transcript") }
          else { setListenStatus("No speech detected") }
          setTimeout(() => setListenStatus(null), 3000)
          setListenElapsed(0)
          listenStoppingRef.current = false
        }
      }
      listenEngineRef.current = null
      return
    }

    // ── Start ──
    try {
      setListenStatus("Initializing...")
      listenTranscriptRef.current = ""

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
      setListenElapsed(0)
      if (listenEngineRef.current !== "chunked") {
        setListenStatus("Listening...")
      }

      listenTimerRef.current = setInterval(() => {
        setListenElapsed(prev => prev + 1)
      }, 1000)

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
        <div className="flex gap-0.5">
          <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>O</Kbd>
        </div>
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
        <div className="flex gap-0.5">
          <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>J</Kbd>
        </div>
      </div>

      <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/30 to-transparent" />

      {/* Chat */}
      <div className="flex items-center gap-1 group/cmd">
        <button
          className="glass-btn"
          onClick={onChatToggle}
          type="button"
        >
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
        onClick={() => setIsTooltipVisible(!isTooltipVisible)}
        type="button"
      >
        <div className={`w-5 h-5 rounded-full transition-all duration-200 flex items-center justify-center cursor-pointer border ${
          isTooltipVisible
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

      {/* Shortcuts bar → bottom portal */}
      {shortcutsBarPortalId && document.getElementById(shortcutsBarPortalId) &&
        createPortal(shortcutsBarContent, document.getElementById(shortcutsBarPortalId)!)}

      {/* Shortcuts help panel (floats above bottom bar) */}
      {isTooltipVisible && shortcutsBarPortalId && document.getElementById(shortcutsBarPortalId) && createPortal(
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

      {/* Record status panel */}
      {recordStatus !== null && actionBarPortalId && document.getElementById(actionBarPortalId) && createPortal(
        <div className="mt-1 liquid-glass-dark p-3 text-[hsl(0,0%,8%)] text-xs max-w-md animate-slide-up mx-auto w-fit">
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
        </div>,
        document.getElementById(actionBarPortalId)!
      )}

      {/* Listen status panel */}
      {listenStatus !== null && actionBarPortalId && document.getElementById(actionBarPortalId) && createPortal(
        <div className="mt-1 liquid-glass-dark p-3 text-[hsl(0,0%,8%)] text-xs max-w-md animate-slide-up mx-auto w-fit">
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
        </div>,
        document.getElementById(actionBarPortalId)!
      )}
    </>
  )
}

export default QueueCommands
