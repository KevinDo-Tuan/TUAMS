# Tuams

An invisible desktop AI assistant that provides real-time transcription, AI suggestions, and chat during meetings, interviews, and presentations.

Built with Electron + React + TypeScript.

---
<img width="1229" height="764" alt="{43AA89B6-9A78-45B4-959C-92DA25181760}" src="https://github.com/user-attachments/assets/993421e5-fecf-4e06-a32c-77e5bc1483ee" />
<img width="1239" height="764" alt="{01381644-D9BE-4F84-857C-8E213E125D56}" src="https://github.com/user-attachments/assets/e0eb7248-2582-4ffc-b653-6d9508c5526a" />

---


## Features

- **Invisible overlay** - Translucent, always-on-top frameless window. Toggle visibility with `Ctrl+B`.
- **Stealth mode** - Fully transparent window hidden from screen share (`Ctrl+Shift+G`).
- **Screenshot analysis** - Capture any screen content and get AI-powered analysis with vision models.
- **Screen recording** - Record screen + microphone, then ask AI about what happened (`Ctrl+Shift+O`).
- **Live transcription** - Real-time speech-to-text with live AI suggestions every 2 seconds (`Ctrl+Shift+J`).
- **AI chat** - Multi-turn chat with context from your session, attachments, and PDFs.
- **Multi-provider AI** - Ollama (local), Ollama Cloud, Groq, and OpenRouter with automatic fallback chains.
- **Multi-engine STT** - Sherpa-ONNX, Vosk (11 languages), Deepgram, AssemblyAI, Google STT.
- **Cross-platform** - Windows, macOS, and Linux.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [Git](https://git-scm.com/)

### Install

```bash
git clone https://github.com/KevinDo-Tuan/Tuams.git
cd Tuams
npm install
```

If you get Sharp/Python build errors:
```bash
rm -rf node_modules package-lock.json
SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install --ignore-scripts
npm rebuild sharp
```

### Configure Environment

```bash
cp .env.example .env
```

Open `.env` and fill in the keys you want to use. See the [Environment Variables](#environment-variables) section below for details on each key and how to get them.

### Run

```bash
npm start
```

This starts the Vite dev server (port 5180) and launches the Electron app.
On first launch, the app will auto-download speech recognition models (~50MB).

### Build for Production

```bash
npm run dist
```

Installers are output to the `release/` folder (`.exe` for Windows, `.dmg` for macOS, `.AppImage`/`.deb` for Linux).

---

## Environment Variables

Create a `.env` file in the project root (or copy from `.env.example`). Below is every variable the app supports, whether it's required, and step-by-step instructions to get each key.

### LLM Providers

These power the AI chat, live suggestions, and screenshot/recording analysis.

| Variable | Required? | Description |
|----------|-----------|-------------|
| `GROQ_API_KEY` | **Recommended** | Fastest free option for chat & live suggestions (30 requests/min free tier) |
| `OPENROUTER_API_KEY` | Optional | Fallback for vision models (screenshot/recording analysis) |
| `OLLAMA_URL` | Optional | Ollama server address. Defaults to `http://localhost:11434` |
| `OLLAMA_MODEL` | Optional | Preferred local Ollama model. Leave empty for auto-select |

#### How to get a Groq API key (free)

1. Go to [https://console.groq.com/](https://console.groq.com/)
2. Sign up or log in with Google/GitHub
3. Navigate to **API Keys** in the left sidebar
4. Click **Create API Key**, give it a name, and copy the key
5. Paste it into `.env`:
   ```
   GROQ_API_KEY=gsk_xxxxxxxxxxxx
   ```
6. Free tier: 30 requests/minute, 14,400 requests/day

#### How to get an OpenRouter API key (optional)

1. Go to [https://openrouter.ai/](https://openrouter.ai/)
2. Sign up or log in
3. Go to [https://openrouter.ai/keys](https://openrouter.ai/keys)
4. Click **Create Key**, copy the key
5. Paste it into `.env`:
   ```
   OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxx
   ```
6. Some models are free; others require credits (add balance at [https://openrouter.ai/credits](https://openrouter.ai/credits))

#### How to set up Ollama (free, local, private)

1. Download and install from [https://ollama.ai/](https://ollama.ai/)
2. Run `ollama login` in terminal (free account — enables cloud-routed models)
3. The app auto-starts Ollama and pulls models in the background
4. No API key needed. Just leave `OLLAMA_URL` at default:
   ```
   OLLAMA_URL=http://localhost:11434
   ```

### Speech-to-Text Providers

These are **all optional**. The app works out of the box with local STT engines (Sherpa-ONNX and Vosk) that require no API keys. Cloud STT providers are only needed if you want higher accuracy or faster transcription.

| Variable | Required? | Description |
|----------|-----------|-------------|
| `DEEPGRAM_API_KEY` | Optional | Cloud STT — high accuracy, real-time streaming |
| `ASSEMBLYAI_API_KEY` | Optional | Cloud STT — good for long-form audio |
| `GOOGLE_STT_API_KEY` | Optional | Google Cloud Speech-to-Text |

#### How to get a Deepgram API key

1. Go to [https://console.deepgram.com/signup](https://console.deepgram.com/signup)
2. Sign up (free tier: $200 credit)
3. Go to **API Keys** in the dashboard
4. Click **Create a New API Key**, copy it
5. Paste into `.env`:
   ```
   DEEPGRAM_API_KEY=xxxxxxxxxxxxxxxx
   ```

#### How to get an AssemblyAI API key

1. Go to [https://www.assemblyai.com/dashboard/signup](https://www.assemblyai.com/dashboard/signup)
2. Sign up (free tier available)
3. Your API key is shown on the dashboard home page
4. Paste into `.env`:
   ```
   ASSEMBLYAI_API_KEY=xxxxxxxxxxxxxxxx
   ```

#### How to get a Google STT API key

1. Go to [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. Create a project (or select an existing one)
3. Enable the **Cloud Speech-to-Text API**: [https://console.cloud.google.com/apis/library/speech.googleapis.com](https://console.cloud.google.com/apis/library/speech.googleapis.com)
4. Go to **APIs & Services > Credentials**
5. Click **Create Credentials > API Key**
6. Copy the key and paste into `.env`:
   ```
   GOOGLE_STT_API_KEY=AIzaxxxxxxxxxxxxxxxx
   ```
7. Free tier: 60 minutes/month

### Example `.env` file

```env
# LLM Providers
OPENROUTER_API_KEY=
GROQ_API_KEY=gsk_your_groq_key_here

# Speech-to-Text Providers (all optional — local STT works without keys)
DEEPGRAM_API_KEY=
ASSEMBLYAI_API_KEY=
GOOGLE_STT_API_KEY=

# Ollama Configuration (no key needed)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=
```

### Minimum Setup (completely free)

You have two options to get started with zero cost:

**Option A: Ollama only (fully local, private)**
1. Install [Ollama](https://ollama.ai/) and run `ollama login`
2. Leave all API key fields in `.env` empty
3. The app uses Ollama cloud-routed models and local models automatically

**Option B: Groq + Ollama (fastest free)**
1. Install [Ollama](https://ollama.ai/) and run `ollama login`
2. Get a free [Groq API key](https://console.groq.com/) and add it to `.env`
3. Chat uses Groq (fast), vision uses Ollama cloud models (free)

---

## AI Provider Fallback Chains

The app automatically falls through providers if one fails or times out.

### Text / Chat

| Priority | Provider | Model | How to enable |
|----------|----------|-------|---------------|
| 1 | **Groq** | llama-3.3-70b-versatile | Set `GROQ_API_KEY` |
| 2 | **Ollama Cloud** | glm-5, llama3.3, qwen2.5 | Run `ollama login` |
| 3 | **Ollama Local** | Any installed model | `ollama pull mixtral:8x7b` |

### Vision (Screenshot & Recording Analysis)

| Priority | Provider | Model | How to enable |
|----------|----------|-------|---------------|
| 1 | **Ollama Cloud** | qwen3-vl:235b-cloud | Run `ollama login` |
| 2 | **OpenRouter** | qwen3-vl-32b | Set `OPENROUTER_API_KEY` |

### Speech-to-Text

| Priority | Engine | Type | How to enable |
|----------|--------|------|---------------|
| 1 | **Deepgram** | Cloud | Set `DEEPGRAM_API_KEY` |
| 2 | **AssemblyAI** | Cloud | Set `ASSEMBLYAI_API_KEY` |
| 3 | **Google STT** | Cloud | Set `GOOGLE_STT_API_KEY` |
| 4 | **Sherpa-ONNX** | Local | Auto-downloaded (English) |
| 5 | **Vosk** | Local | Auto-downloaded per language |

Supported Vosk languages: English, Chinese, Spanish, French, German, Russian, Japanese, Korean, Portuguese, Italian, Vietnamese.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | Toggle window visibility |
| `Ctrl+Shift+H` | Take screenshot |
| `Ctrl+Shift+Enter` | Generate solution from screenshots |
| `Ctrl+Shift+O` | Toggle screen recording (video + mic) |
| `Ctrl+Shift+J` | Toggle listen mode (live transcription + AI suggestions) |
| `Ctrl+Shift+C` | Toggle chat panel |
| `Ctrl+Shift+G` | Toggle stealth mode (hidden from screen share) |
| `Ctrl+Shift+K` | Copy focused app's text and send to AI |
| `Ctrl+Shift+R` | Reset (clear all screenshots) |
| `Ctrl+Shift+Space` | Center and show window |
| `Ctrl+Shift+Arrows` | Move window |
| `Ctrl+Alt+Arrows` | Resize window |
| `Ctrl+Q` | Quit |

On macOS, replace `Ctrl` with `Cmd`.

---

## Project Structure

```
Tuams/
├── electron/                   # Electron main process
│   ├── main.ts                 # App entry, window creation, model downloads
│   ├── ipcHandlers.ts          # All IPC channel handlers
│   ├── shortcuts.ts            # Global keyboard shortcut registration
│   ├── LLMHelper.ts            # AI provider integration & fallback chains
│   ├── StreamingSpeech.ts      # STT engine management
│   ├── WindowHelper.ts         # Window positioning, stealth mode
│   ├── ScreenshotHelper.ts     # Screen capture & thumbnail generation
│   ├── ProcessingHelper.ts     # AI solution generation orchestration
│   └── preload.ts              # Context bridge (renderer <-> main)
├── src/                        # React renderer
│   ├── App.tsx                 # Root component, view routing
│   ├── index.css               # Global styles, animations, glass UI
│   ├── _pages/
│   │   ├── Queue.tsx           # Main page: chat, screenshots, recording
│   │   ├── Solutions.tsx       # AI solution display
│   │   └── Debug.tsx           # Solution refinement
│   ├── components/
│   │   ├── Queue/              # Command bar, screenshot list, chat panel
│   │   ├── Chat/               # Markdown message renderer
│   │   └── ui/                 # Toast, dialog, model selector
│   └── types/                  # TypeScript type definitions
├── assets/                     # App icons (tray, window)
├── public/
│   └── pcm-worklet.js          # Web Audio worklet for mic recording
├── .env.example                # Environment variable template
├── package.json                # Dependencies & build config
├── tsconfig.json               # TypeScript config
├── tailwind.config.js          # Tailwind CSS theme
└── index.html                  # HTML entry point
```

---

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start development mode (Vite + Electron concurrently) |
| `npm run dev` | Vite dev server only (no Electron) |
| `npm run build` | Compile TypeScript + bundle React to `dist/` |
| `npm run dist` | Build production installers to `release/` |
| `npm run watch` | Watch Electron TypeScript files for changes |
| `npm run clean` | Remove compiled output (`dist/`, `dist-electron/`) |

---

## System Requirements

|  | Minimum | Recommended |
|--|---------|-------------|
| **RAM** | 4 GB | 8+ GB (16 GB for local AI models) |
| **CPU** | Dual-core | Quad-core |
| **Storage** | 2 GB | 5+ GB |
| **OS** | Windows 10, macOS 10.15, Ubuntu 20.04 | Latest versions |

---

## Troubleshooting

### App won't start
- Make sure port 5180 is free: `lsof -i :5180` (macOS/Linux) or `netstat -ano | findstr :5180` (Windows)
- For Ollama users: ensure Ollama is running (`ollama serve`)

### Sharp build errors
```bash
rm -rf node_modules package-lock.json
SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install --ignore-scripts
npm rebuild sharp
```

### No AI responses
- Check Ollama is running: `curl http://localhost:11434/api/tags`
- Or verify your API key is correctly set in `.env`
- Check the developer console (`Ctrl+Shift+I`) for error messages

### STT not working
- Wait for model download to complete on first launch (check console logs)
- For non-English: select your language using the language picker in the action bar

### General installation issues
1. Delete `node_modules/` and `package-lock.json`
2. Run `npm install` again
3. Try `npm start`

---

## Contributing

Contributions welcome! Feel free to open issues or submit PRs for:
- Bug fixes
- New AI/STT provider integrations
- UI improvements
- Documentation

---

## License

ISC
