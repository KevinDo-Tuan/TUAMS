# Tuams

An invisible desktop AI assistant that provides real-time transcription, AI suggestions, and chat during meetings, interviews, and presentations.

Built with Electron + React + TypeScript.

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

- [Node.js](https://nodejs.org/) (v18+)
- [Git](https://git-scm.com/)
- [Ollama](https://ollama.ai/) (recommended, for local/free AI)

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

### Configure

```bash
cp .env.example .env
```

Edit `.env` with your API keys (all optional if using Ollama):

```env
# LLM Providers
OPENROUTER_API_KEY=          # Optional: vision model fallback
GROQ_API_KEY=                # Optional: fastest free chat (30 req/min)

# Speech-to-Text (optional - local Vosk/Sherpa work without keys)
DEEPGRAM_API_KEY=
ASSEMBLYAI_API_KEY=
GOOGLE_STT_API_KEY=

# Ollama (default, no key needed)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=                # Leave empty for auto-select
```

### Run

```bash
npm start
```

This starts the Vite dev server (port 5180) and launches the Electron app. On first launch, the app will auto-download speech recognition models (~50MB).

### Build for Production

```bash
npm run dist
```

Installers are output to the `release/` folder.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | Toggle window visibility |
| `Ctrl+Shift+H` | Take screenshot |
| `Ctrl+Shift+Enter` | Generate solution from screenshots |
| `Ctrl+Shift+O` | Toggle screen recording (video + mic) |
| `Ctrl+Shift+J` | Toggle listen mode (live transcription) |
| `Ctrl+Shift+C` | Toggle chat panel |
| `Ctrl+Shift+G` | Toggle stealth mode |
| `Ctrl+Shift+K` | Copy page text and send to AI |
| `Ctrl+Shift+R` | Reset (clear all screenshots) |
| `Ctrl+Shift+Space` | Center and show window |
| `Ctrl+Shift+Arrows` | Move window |
| `Ctrl+Alt+Arrows` | Resize window |
| `Ctrl+Q` | Quit |

On macOS, replace `Ctrl` with `Cmd`.

---

## AI Providers

The app uses a fallback chain — if the first provider fails or times out, it automatically tries the next.

### Text / Chat

| Priority | Provider | Model | Setup |
|----------|----------|-------|-------|
| 1 | **Groq** | llama-3.3-70b | Set `GROQ_API_KEY` in `.env` |
| 2 | **Ollama Cloud** | glm-5, llama3.3, qwen2.5 | `ollama login` (free) |
| 3 | **Ollama Local** | Any installed model | `ollama pull mixtral:8x7b` |

### Vision (Screenshot/Recording Analysis)

| Priority | Provider | Model | Setup |
|----------|----------|-------|-------|
| 1 | **Ollama Cloud** | qwen3-vl:235b-cloud | `ollama login` (free) |
| 2 | **OpenRouter** | qwen3-vl-32b | Set `OPENROUTER_API_KEY` in `.env` |

### Recommended Setup (Free)

1. Install [Ollama](https://ollama.ai/)
2. Run `ollama login` (free account, enables cloud models)
3. The app auto-starts Ollama and pulls models in the background

---

## Speech-to-Text Engines

| Engine | Type | Languages | Setup |
|--------|------|-----------|-------|
| **Sherpa-ONNX** | Local | English | Auto-downloaded on first launch |
| **Vosk** | Local | 11 languages | Auto-downloaded per language |
| **Deepgram** | Cloud | Many | Set `DEEPGRAM_API_KEY` |
| **AssemblyAI** | Cloud | Many | Set `ASSEMBLYAI_API_KEY` |
| **Google STT** | Cloud | Many | Set `GOOGLE_STT_API_KEY` |

Supported Vosk languages: English, Chinese, Spanish, French, German, Russian, Japanese, Korean, Portuguese, Italian, Vietnamese.

The app defaults to local engines (Sherpa/Vosk) and falls back through cloud engines if API keys are configured.

---

## Project Structure

```
Tuams/
├── electron/                   # Electron main process
│   ├── main.ts                 # App entry, window creation, model downloads
│   ├── ipcHandlers.ts          # All IPC channel handlers
│   ├── shortcuts.ts            # Global keyboard shortcut registration
│   ├── LLMHelper.ts            # AI provider integration & fallback chains
│   ├── StreamingSpeech.ts      # STT engine management (Vosk, Sherpa, Deepgram, etc.)
│   ├── WindowHelper.ts         # Window positioning, stealth mode
│   ├── ScreenshotHelper.ts     # Screen capture & thumbnail generation
│   ├── ProcessingHelper.ts     # AI solution generation orchestration
│   └── preload.ts              # Context bridge (renderer ↔ main)
├── src/                        # React renderer
│   ├── App.tsx                 # Root component, view routing, resize handles
│   ├── index.css               # Global styles, animations, glass UI
│   ├── _pages/
│   │   ├── Queue.tsx           # Main page: chat, screenshots, recording
│   │   ├── Solutions.tsx       # AI solution display
│   │   └── Debug.tsx           # Solution refinement
│   ├── components/
│   │   ├── Queue/              # Command bar, screenshot list, chat panel
│   │   ├── Chat/               # Markdown message renderer
│   │   └── ui/                 # Toast, dialog, model selector
│   └── types/                  # TypeScript definitions
├── assets/                     # App icons (tray, window)
├── public/
│   └── pcm-worklet.js          # Web Audio worklet for recording
├── .env.example                # Environment variable template
├── package.json                # Dependencies & build config
├── tsconfig.json               # TypeScript config
├── tailwind.config.js          # Tailwind CSS theme
└── vite.config.ts              # Vite + Electron plugin config
```

---

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start dev mode (Vite + Electron) |
| `npm run dev` | Vite dev server only |
| `npm run build` | Compile TypeScript + bundle React |
| `npm run dist` | Build production installers (`release/`) |
| `npm run watch` | Watch Electron TypeScript for changes |
| `npm run clean` | Remove compiled output |

---

## System Requirements

|  | Minimum | Recommended |
|--|---------|-------------|
| RAM | 4 GB | 8+ GB (16 GB for local AI models) |
| CPU | Dual-core | Quad-core |
| Storage | 2 GB | 5+ GB |
| OS | Windows 10, macOS 10.15, Ubuntu 20.04 | Latest versions |

---

## Troubleshooting

**App won't start:**
- Make sure port 5180 is free
- For Ollama users: ensure Ollama is running (`ollama serve`)

**Sharp build errors:**
```bash
rm -rf node_modules package-lock.json
SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install --ignore-scripts
npm rebuild sharp
```

**No AI responses:**
- Check that Ollama is running: `curl http://localhost:11434/api/tags`
- Or set up a cloud provider key in `.env`

**STT not working:**
- Wait for model download to complete on first launch (check console logs)
- For non-English: select your language in the language picker dropdown

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
