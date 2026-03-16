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
]

export class LLMHelper {
  private readonly systemPrompt = `You are Wingman AI, a helpful, proactive assistant for any kind of problem or situation (not just coding). For any user input, analyze the situation, provide a clear problem statement, relevant context, and suggest several possible responses or actions the user could take next. Always explain your reasoning. Present your suggestions as a list of options or next steps.`
  private useCloud: boolean = false
  private ollamaModel: string = "mixtral:8x7b"
  private ollamaUrl: string = "http://localhost:11434"
  private cloudModel: string = "glm-5:cloud"
  private activeModel: string = "mixtral:8x7b"

  constructor(_apiKey?: string, _useOllama: boolean = true, ollamaModel?: string, ollamaUrl?: string) {
    this.ollamaUrl = ollamaUrl || "http://localhost:11434"
    this.ollamaModel = ollamaModel || "mixtral:8x7b"
    console.log(`[LLMHelper] Using Ollama with model: ${this.ollamaModel}`)
    this.initializeOllamaModel()
  }

  private cleanJsonResponse(text: string): string {
    text = text.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '')
    return text.trim()
  }

  private async callOllamaModel(url: string, model: string, prompt: string): Promise<string> {
    const isCloud = OLLAMA_CLOUD_MODELS.includes(model)
    const timeoutMs = isCloud ? 90_000 : 60_000
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
          options: { temperature: 0.7, top_p: 0.9 }
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
    // Cloud mode: Ollama routes cloud models internally (via `ollama login` credentials)
    // No auth header needed — Ollama handles it.
    if (this.useCloud) {
      // Try primary cloud model first, then fallback to gpt-oss:20b-cloud on 401
      const cloudChain = [this.cloudModel, ...(this.cloudModel !== "gpt-oss:20b-cloud" ? ["gpt-oss:20b-cloud"] : [])]
      for (const model of cloudChain) {
        try {
          console.log(`[LLMHelper] Trying cloud model: ${model}`)
          const result = await this.callOllamaModel(this.ollamaUrl, model, prompt)
          this.activeModel = model
          console.log(`[LLMHelper] Success with cloud model: ${model}`)
          return result
        } catch (error) {
          const isUnauthorized = error.message.includes("401")
          console.warn(`[LLMHelper] Cloud model ${model} failed: ${error.message}`)
          if (!isUnauthorized) break // Only retry on 401, not other errors
        }
      }
      console.warn("[LLMHelper] All cloud models failed. Falling back to local model.")
    }

    // Local Ollama
    try {
      const result = await this.callOllamaModel(this.ollamaUrl, this.ollamaModel, prompt)
      this.activeModel = this.ollamaModel
      return result
    } catch (error) {
      console.error("[LLMHelper] Error calling local Ollama:", error)
      throw new Error(`Failed to connect to Ollama: ${error.message}. Make sure Ollama is running on ${this.ollamaUrl}`)
    }
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
        console.log(`[LLMHelper] Auto-selected first available model: ${this.ollamaModel}`)
      }
      this.activeModel = this.ollamaModel
      console.log(`[LLMHelper] Ready with model: ${this.ollamaModel}`)
    } catch (error) {
      console.error(`[LLMHelper] Failed to initialize Ollama model: ${error.message}`)
    }
  }

  public async extractProblemFromImages(imagePaths: string[]) {
    try {
      const imageDescriptions = imagePaths.map((_, i) => `[Image ${i + 1} attached]`).join(", ")
      const prompt = `${this.systemPrompt}\n\nYou are a wingman. The user has shared ${imagePaths.length} screenshot(s): ${imageDescriptions}. Please analyze and extract the following information in JSON format:\n{\n  "problem_statement": "A clear statement of the problem or situation depicted in the images.",\n  "context": "Relevant background or context from the images.",\n  "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],\n  "reasoning": "Explanation of why these suggestions are appropriate."\n}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`
      const text = this.cleanJsonResponse(await this.callOllama(prompt))
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
      const prompt = `${this.systemPrompt}\n\nYou are a wingman. Given:\n1. The original problem or situation: ${JSON.stringify(problemInfo, null, 2)}\n2. The current response or approach: ${currentCode}\n3. The user has shared ${debugImagePaths.length} debug screenshot(s).\n\nPlease analyze and provide feedback in this JSON format:\n{\n  "solution": {\n    "code": "The code or main answer here.",\n    "problem_statement": "Restate the problem or situation.",\n    "context": "Relevant background/context.",\n    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],\n    "reasoning": "Explanation of why these suggestions are appropriate."\n  }\n}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`
      const text = this.cleanJsonResponse(await this.callOllama(prompt))
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

  public async analyzeImageFile(_imagePath: string) {
    try {
      const prompt = `${this.systemPrompt}\n\nThe user has shared a screenshot. Describe what you would expect to see and suggest several possible actions or responses the user could take next. Do not return a structured JSON object, just answer naturally and be concise.`
      const text = await this.callOllama(prompt)
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
