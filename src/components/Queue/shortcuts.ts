export type ShortcutItem = {
  label: string
  keys: string[]
  desc: string
}

export const QUEUE_SHORTCUTS: ShortcutItem[] = [
  { label: "Toggle Window", keys: ["Ctrl", "B"], desc: "Show or hide this window" },
  { label: "Stealth", keys: ["Ctrl", "Shift", "G"], desc: "Hide from screen share" },
  { label: "Screenshot", keys: ["Ctrl", "Shift", "H"], desc: "Capture current screen" },
  { label: "Solve", keys: ["Ctrl", "Shift", "Enter"], desc: "Generate solution from screenshots" },
  { label: "Record", keys: ["Ctrl", "Shift", "O"], desc: "Record screen + mic" },
  { label: "Listen", keys: ["Ctrl", "Shift", "J"], desc: "Listen & transcribe audio" },
  { label: "Ask AI", keys: ["H"], desc: "Send transcript to chat (while listening)" },
  { label: "Chat", keys: ["Ctrl", "Shift", "C"], desc: "Toggle chat window" },
  { label: "Reset", keys: ["Ctrl", "Shift", "R"], desc: "Clear all screenshots & reset" },
  { label: "Copy & Ask AI", keys: ["Ctrl", "Shift", "K"], desc: "Copy page text & send to AI" },
  { label: "Center Window", keys: ["Ctrl", "Shift", "Space"], desc: "Center and show window" },
  { label: "Move Window", keys: ["Ctrl", "Shift", "Arrows"], desc: "Reposition the window" },
  { label: "Resize Window", keys: ["Ctrl", "Alt", "Arrows"], desc: "Grow or shrink the window" },
]
