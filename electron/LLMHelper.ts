import * as fs from "fs"

interface OllamaResponse {
  response: string
  done: boolean
}

// Known Ollama cloud-routed models (requires `ollama login`)
export const OLLAMA_CLOUD_MODELS = [
  "glm-5:cloud",
  "gpt-oss:20b-cloud",
  "llama3.3:cloud",
  "phi4-mini:cloud",
  "qwen2.5:cloud",
  "qwen3-vl:235b-cloud",
]

export class LLMHelper {
  private readonly systemPrompt = `You are Wingman AI, a helpful, proactive assistant for any kind of problem or situation (not just coding). For any user input, analyze the situation, provide a clear problem statement, relevant context, and suggest several possible responses or actions the user could take next. Always explain your reasoning. Present your suggestions as a list of options or next steps.`
  private useCloud: boolean = true
  private ollamaModel: string = "mixtral:8x7b"
  private ollamaUrl: string = "http://localhost:11434"
  private cloudModel: string = "glm-5:cloud"
  private activeModel: string = "glm-5:cloud"
  private readonly openRouterApiKey = process.env.OPENROUTER_API_KEY || "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"

  // Text chat fallback chain: cloud first → local
  private static readonly TEXT_FALLBACK_CHAIN = [
    "glm-5:cloud",
    "gpt-oss:20b-cloud",
    "llama3.3:cloud",
    "qwen2.5:cloud",
    "mixtral:8x7b",
  ]

  // Vision fallback chain: Ollama cloud → OpenRouter
  private static readonly VISION_FALLBACK_CHAIN: { model: string; provider: "ollama" | "openrouter" }[] = [
    { model: "qwen3-vl:235b-cloud", provider: "ollama" },
    { model: "qwen3.5:cloud", provider: "ollama" },
    { model: "qwen/qwen3-vl-32b-instruct", provider: "openrouter" },
  ]

  constructor(_apiKey?: string, _useOllama: boolean = true, ollamaModel?: string, ollamaUrl?: string) {
    this.ollamaUrl = ollamaUrl || "http://localhost:11434"
    this.ollamaModel = ollamaModel || "mixtral:8x7b"
    // Default to cloud model, fall back to local if cloud unavailable
    this.useCloud = true
    this.activeModel = this.cloudModel
    console.log(`[LLMHelper] Default model: ${this.activeModel} (cloud)`)
    this.initializeOllamaModel()
  }

  private cleanJsonResponse(text: string): string {
    text = text.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '')
    return text.trim()
  }

  private async callOllamaModel(url: string, model: string, prompt: string, images?: string[]): Promise<string> {
    const isCloud = OLLAMA_CLOUD_MODELS.includes(model)
    const timeoutMs = images?.length ? 180_000 : (isCloud ? 90_000 : 60_000)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(`${url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: { temperature: 0.7, top_p: 0.9 },
          ...(images?.length ? { images } : {})
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }
      const data: OllamaResponse = await response.json()
      return data.response
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${timeoutMs / 1000}s (model: ${model})`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  private async callOllama(prompt: string): Promise<string> {
    const errors: string[] = []
    // User-selected model first, then remaining fallback chain
    const preferred = this.useCloud ? this.cloudModel : this.ollamaModel
    const chain = [preferred, ...LLMHelper.TEXT_FALLBACK_CHAIN.filter(m => m !== preferred)]

    for (const model of chain) {
      try {
        console.log(`[LLMHelper] Trying text model: ${model}`)
        const result = await this.callOllamaModel(this.ollamaUrl, model, prompt)
        this.activeModel = model
        if (model !== preferred) {
          console.log(`[LLMHelper] Fallback success: ${model}`)
        }
        return result
      } catch (err) {
        console.warn(`[LLMHelper] ${model} failed: ${err.message}`)
        errors.push(`${model}: ${err.message}`)
      }
    }
    throw new Error(`All text models failed:\n${errors.join('\n')}`)
  }

  private async callOpenRouterVision(model: string, prompt: string, images: string[]): Promise<string> {
    const content: any[] = [{ type: "text", text: prompt }]
    for (const img of images) {
      content.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${img}` }
      })
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 180_000)
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.openRouterApiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content }],
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`OpenRouter ${response.status} ${response.statusText}`)
      }
      const data = await response.json()
      return data.choices[0].message.content
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`OpenRouter request timed out after 180s (model: ${model})`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  private async callVisionWithFallback(prompt: string, images: string[]): Promise<string> {
    const errors: string[] = []
    for (const { model, provider } of LLMHelper.VISION_FALLBACK_CHAIN) {
      try {
        console.log(`[LLMHelper] Trying vision model: ${model} (${provider})`)
        if (provider === "openrouter") {
          const result = await this.callOpenRouterVision(model, prompt, images)
          this.activeModel = model
          return result
        }
        const result = await this.callOllamaModel(this.ollamaUrl, model, prompt, images)
        this.activeModel = model
        if (model !== LLMHelper.VISION_FALLBACK_CHAIN[0].model) {
          console.log(`[LLMHelper] Vision fallback success: ${model}`)
        }
        return result
      } catch (err) {
        console.warn(`[LLMHelper] Vision ${model} failed: ${err.message}`)
        errors.push(`${model}: ${err.message}`)
      }
    }
    throw new Error(`All 3 vision models failed:\n${errors.join('\n')}`)
  }

  private async checkOllamaAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`)
      return response.ok
    } catch {
      return false
    }
  }

  private async initializeOllamaModel(): Promise<void> {
    try {
      const availableModels = await this.getLocalOllamaModels()
      if (availableModels.length === 0) {
        console.warn("[LLMHelper] No Ollama models found")
        return
      }
      if (!availableModels.includes(this.ollamaModel)) {
        this.ollamaModel = availableModels[0]
        console.log(`[LLMHelper] Auto-selected first available local model: ${this.ollamaModel}`)
      }
      // Don't override activeModel if already set to cloud
      if (!this.useCloud) {
        this.activeModel = this.ollamaModel
      }
      console.log(`[LLMHelper] Ready with model: ${this.activeModel}`)
    } catch (error) {
      console.error(`[LLMHelper] Failed to initialize Ollama model: ${error.message}`)
    }
  }

  // Read image file(s) as raw base64 strings for vision model
  private readImagesAsBase64(imagePaths: string[]): string[] {
    return imagePaths
      .map(p => { try { return fs.readFileSync(p).toString("base64") } catch { return null } })
      .filter((b): b is string => b !== null)
  }

  public async extractProblemFromImages(imagePaths: string[]) {
    try {
      const images = this.readImagesAsBase64(imagePaths)
      const prompt = `${this.systemPrompt}\n\nYou are a wingman. The user has shared ${imagePaths.length} screenshot(s). Please analyze the attached images and extract the following information in JSON format:\n{\n  "problem_statement": "A clear statement of the problem or situation depicted in the images.",\n  "context": "Relevant background or context from the images.",\n  "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],\n  "reasoning": "Explanation of why these suggestions are appropriate."\n}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`
      const text = this.cleanJsonResponse(
        await this.callVisionWithFallback(prompt, images)
      )
      return JSON.parse(text)
    } catch (error) {
      console.error("Error extracting problem from images:", error)
      throw error
    }
  }

  public async generateSolution(problemInfo: any) {
    const prompt = `${this.systemPrompt}\n\nGiven this problem or situation:\n${JSON.stringify(problemInfo, null, 2)}\n\nPlease provide your response in the following JSON format:\n{\n  "solution": {\n    "code": "The code or main answer here.",\n    "problem_statement": "Restate the problem or situation.",\n    "context": "Relevant background/context.",\n    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],\n    "reasoning": "Explanation of why these suggestions are appropriate."\n  }\n}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`
    console.log("[LLMHelper] Calling LLM for solution...")
    try {
      const text = this.cleanJsonResponse(await this.callOllama(prompt))
      const parsed = JSON.parse(text)
      console.log("[LLMHelper] Parsed LLM response:", parsed)
      return parsed
    } catch (error) {
      console.error("[LLMHelper] Error in generateSolution:", error)
      throw error
    }
  }

  public async debugSolutionWithImages(problemInfo: any, currentCode: string, debugImagePaths: string[]) {
    try {
      const images = this.readImagesAsBase64(debugImagePaths)
      const prompt = `${this.systemPrompt}\n\nYou are a wingman. Given:\n1. The original problem or situation: ${JSON.stringify(problemInfo, null, 2)}\n2. The current response or approach: ${currentCode}\n3. The attached ${debugImagePaths.length} debug screenshot(s).\n\nPlease analyze and provide feedback in this JSON format:\n{\n  "solution": {\n    "code": "The code or main answer here.",\n    "problem_statement": "Restate the problem or situation.",\n    "context": "Relevant background/context.",\n    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],\n    "reasoning": "Explanation of why these suggestions are appropriate."\n  }\n}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`
      const text = this.cleanJsonResponse(
        await this.callVisionWithFallback(prompt, images)
      )
      const parsed = JSON.parse(text)
      console.log("[LLMHelper] Parsed debug LLM response:", parsed)
      return parsed
    } catch (error) {
      console.error("Error debugging solution with images:", error)
      throw error
    }
  }

  public async analyzeAudioFile(_audioPath: string) {
    try {
      const prompt = `${this.systemPrompt}\n\nThe user has shared an audio file. Describe what you would expect from an audio clip in that context and suggest several possible actions or responses the user could take next. Do not return a structured JSON object, just answer naturally as you would to a user.`
      const text = await this.callOllama(prompt)
      return { text, timestamp: Date.now() }
    } catch (error) {
      console.error("Error analyzing audio file:", error)
      throw error
    }
  }

  public async analyzeAudioFromBase64(_data: string, _mimeType: string) {
    try {
      const prompt = `${this.systemPrompt}\n\nThe user has shared an audio clip. Provide a concise helpful response and suggest possible actions the user could take next. Do not return a structured JSON object, just answer naturally and be concise.`
      const text = await this.callOllama(prompt)
      return { text, timestamp: Date.now() }
    } catch (error) {
      console.error("Error analyzing audio from base64:", error)
      throw error
    }
  }

  public async analyzeImageFile(imagePath: string) {
    try {
      const images = this.readImagesAsBase64([imagePath])
      const prompt = `${this.systemPrompt}\n\nThe user has shared a screenshot. Analyze what is shown in the image and suggest several possible actions or responses the user could take next. Be concise and helpful.`
      const text = await this.callVisionWithFallback(prompt, images)
      return { text, timestamp: Date.now() }
    } catch (error) {
      console.error("Error analyzing image file:", error)
      throw error
    }
  }

  public async chatWithGemini(message: string): Promise<string> {
    try {
      return this.callOllama(message)
    } catch (error) {
      console.error("[LLMHelper] Error in chatWithGemini:", error)
      throw error
    }
  }

  public async chat(message: string): Promise<string> {
    return this.chatWithGemini(message)
  }

  public async chatWithVision(message: string, images: string[]): Promise<string> {
    const prompt = `${this.systemPrompt}\n\n${message}`
    console.log(`[LLMHelper] Vision request: ${images.length} images`)
    return this.callVisionWithFallback(prompt, images)
  }

  public isUsingOllama(): boolean {
    return true
  }

  // Returns locally-installed models only
  public async getLocalOllamaModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`)
      if (!response.ok) throw new Error('Failed to fetch models')
      const data = await response.json()
      return data.models?.map((model: any) => model.name) || []
    } catch (error) {
      console.error("[LLMHelper] Error fetching Ollama models:", error)
      return []
    }
  }

  // Returns local models + known cloud model names
  public async getOllamaModels(): Promise<string[]> {
    const local = await this.getLocalOllamaModels()
    // Merge, dedup, cloud models first
    const all = [...OLLAMA_CLOUD_MODELS, ...local.filter(m => !OLLAMA_CLOUD_MODELS.includes(m))]
    return all
  }

  public getCurrentProvider(): "ollama" | "cloud" {
    return this.useCloud ? "cloud" : "ollama"
  }

  public getCurrentModel(): string {
    return this.activeModel
  }

  public async switchToOllama(model?: string, url?: string): Promise<void> {
    this.useCloud = false
    if (url) this.ollamaUrl = url
    if (model) {
      this.ollamaModel = model
    } else {
      await this.initializeOllamaModel()
    }
    this.activeModel = this.ollamaModel
    console.log(`[LLMHelper] Switched to local Ollama: ${this.ollamaModel} at ${this.ollamaUrl}`)
  }

  // model: an Ollama cloud model name like "glm-5:cloud"
  public async switchToGemini(model?: string): Promise<void> {
    this.useCloud = true
    if (model) this.cloudModel = model
    this.activeModel = this.cloudModel
    console.log(`[LLMHelper] Switched to cloud model: ${this.cloudModel} (via local Ollama at ${this.ollamaUrl})`)
  }

  public async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const available = await this.checkOllamaAvailable()
      if (!available) {
        return { success: false, error: `Ollama not available at ${this.ollamaUrl}` }
      }
      await this.callOllama("Hello")
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
}
