/**
 * AudioWorklet processor that downsamples audio from source rate to 16kHz
 * and sends PCM Float32Array chunks via MessagePort.
 * Runs on the audio render thread — zero main-thread blocking.
 */
class PcmDownsampler extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = []
    this.ratio = Math.round(sampleRate / 16000)
    // Flush every 320 samples = 20ms at 16kHz (low latency)
    this.flushSize = 320
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const samples = input[0]
    for (let i = 0; i < samples.length; i += this.ratio) {
      this.buffer.push(samples[i])
    }

    // Send chunks as soon as we have enough
    while (this.buffer.length >= this.flushSize) {
      const chunk = new Float32Array(this.buffer.splice(0, this.flushSize))
      this.port.postMessage(chunk, [chunk.buffer])
    }

    return true
  }
}

registerProcessor('pcm-downsampler', PcmDownsampler)
