import React, { useState, useEffect, useRef } from "react"
import { IoLogOutOutline } from "react-icons/io5"

interface SolutionCommandsProps {
  extraScreenshots: any[]
  onTooltipVisibilityChange?: (visible: boolean, height: number) => void
}

const SolutionCommands: React.FC<SolutionCommandsProps> = ({
  extraScreenshots,
  onTooltipVisibilityChange
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (onTooltipVisibilityChange) {
      let tooltipHeight = 0
      if (tooltipRef.current && isTooltipVisible) {
        tooltipHeight = tooltipRef.current.offsetHeight + 10
      }
      onTooltipVisibilityChange(isTooltipVisible, tooltipHeight)
    }
  }, [isTooltipVisible, onTooltipVisibilityChange])

  const handleMouseEnter = () => {
    setIsTooltipVisible(true)
  }

  const handleMouseLeave = () => {
    setIsTooltipVisible(false)
  }

  return (
    <div>
      <div className="pt-2 w-fit">
        <div className="text-xs liquid-glass-bar py-1 px-3 flex items-center justify-center gap-2.5 draggable-area">

          {/* Show/Hide */}
          <div className="flex items-center gap-1.5 group/cmd">
            <span className="text-[11px] leading-none text-red-200/80 font-medium transition-colors duration-200 group-hover/cmd:text-red-100">
              Show/Hide
            </span>
            <div className="flex gap-0.5">
              <span className="kbd-key">Ctrl</span>
              <span className="kbd-key">B</span>
            </div>
          </div>

          <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/20 to-transparent" />

          {/* Screenshot */}
          <div className="flex items-center gap-1.5 group/cmd">
            <span className="text-[11px] leading-none text-red-200/80 font-medium transition-colors duration-200 group-hover/cmd:text-red-100">
              {extraScreenshots.length === 0 ? "Screenshot your code" : "Screenshot"}
            </span>
            <div className="flex gap-0.5">
              <span className="kbd-key">Ctrl</span>
              <span className="kbd-key">Shift</span>
              <span className="kbd-key">H</span>
            </div>
          </div>

          {extraScreenshots.length > 0 && (
            <>
              <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/20 to-transparent" />
              <div className="flex items-center gap-1.5 group/cmd animate-fade-in">
                <span className="text-[11px] leading-none text-red-200/80 font-medium transition-colors duration-200 group-hover/cmd:text-red-100">
                  Debug
                </span>
                <div className="flex gap-0.5">
                  <span className="kbd-key">Ctrl</span>
                  <span className="kbd-key">Shift</span>
                  <span className="kbd-key">Enter</span>
                </div>
              </div>
            </>
          )}

          <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/20 to-transparent" />

          {/* Start Over */}
          <div className="flex items-center gap-1.5 group/cmd">
            <span className="text-[11px] leading-none text-red-200/80 font-medium transition-colors duration-200 group-hover/cmd:text-red-100">
              Start over
            </span>
            <div className="flex gap-0.5">
              <span className="kbd-key">Ctrl</span>
              <span className="kbd-key">Shift</span>
              <span className="kbd-key">R</span>
            </div>
          </div>

          <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/20 to-transparent" />

          {/* Help tooltip */}
          <div
            className="relative inline-block interactive"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="w-5 h-5 rounded-full bg-white/8 hover:bg-white/15 transition-all duration-200 flex items-center justify-center cursor-help border border-white/5 hover:border-white/10">
              <span className="text-[10px] text-red-200/70">?</span>
            </div>

            {isTooltipVisible && (
              <div
                ref={tooltipRef}
                className="absolute top-full right-0 mt-2 w-72 z-50 animate-scale-in"
              >
                <div className="p-3.5 text-xs liquid-glass-dark text-red-100/90 shadow-2xl">
                  <h3 className="font-semibold text-red-200 mb-3 text-[13px]">Keyboard Shortcuts</h3>
                  <div className="space-y-2.5">
                    {[
                      { label: 'Toggle Window', keys: ['Ctrl', 'B'], desc: 'Show or hide this window' },
                      { label: 'Screenshot', keys: ['Ctrl', 'Shift', 'H'], desc: 'Capture code for debugging' },
                      { label: 'Debug', keys: ['Ctrl', 'Shift', 'Enter'], desc: 'Generate new solutions from screenshots' },
                      { label: 'Start Over', keys: ['Ctrl', 'Shift', 'R'], desc: 'Start fresh with a new question' },
                      { label: 'Center Window', keys: ['Ctrl', 'Shift', 'Space'], desc: 'Center and show window' },
                      { label: 'Move Window', keys: ['Ctrl', 'Shift', 'Arrows'], desc: 'Reposition the window' },
                    ].map(({ label, keys, desc }) => (
                      <div key={label} className="flex items-start justify-between gap-3 group/item">
                        <div>
                          <div className="font-medium text-red-200 group-hover/item:text-red-100 transition-colors duration-200">{label}</div>
                          <div className="text-[10px] text-red-300/50 mt-0.5">{desc}</div>
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
          </div>

          <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-red-400/20 to-transparent" />

          {/* Quit */}
          <button
            className="text-red-400/60 hover:text-red-300 transition-all duration-200 hover:scale-110"
            title="Quit"
            onClick={() => window.electronAPI.quitApp()}
          >
            <IoLogOutOutline className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default SolutionCommands
