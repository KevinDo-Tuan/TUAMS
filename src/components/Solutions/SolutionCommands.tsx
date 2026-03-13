import React, { useState, useEffect, useRef } from "react"

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
  const [showLeaveTooltip, setShowLeaveTooltip] = useState(false)

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
        <div className="text-xs text-white/90 backdrop-blur-md bg-black/60 rounded-lg py-2 px-4 flex items-center justify-center gap-3">
          {/* Show/Hide */}
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-[11px] leading-none font-medium tracking-wide">Show/Hide</span>
            <div className="flex gap-0.5">
              <span className="bg-white/10 rounded px-1.5 py-0.5 text-[10px] leading-none text-white/60 font-mono">Ctrl</span>
              <span className="bg-white/10 rounded px-1.5 py-0.5 text-[10px] leading-none text-white/60 font-mono">B</span>
            </div>
          </div>

          {/* Screenshot */}
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-[11px] leading-none font-medium tracking-wide">
              {extraScreenshots.length === 0 ? "Screenshot your code" : "Screenshot"}
            </span>
            <div className="flex gap-0.5">
              <span className="bg-white/10 rounded px-1.5 py-0.5 text-[10px] leading-none text-white/60 font-mono">Ctrl</span>
              <span className="bg-white/10 rounded px-1.5 py-0.5 text-[10px] leading-none text-white/60 font-mono">H</span>
            </div>
          </div>

          {extraScreenshots.length > 0 && (
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-[11px] leading-none font-medium tracking-wide">Debug</span>
              <div className="flex gap-0.5">
                <span className="bg-white/10 rounded px-1.5 py-0.5 text-[10px] leading-none text-white/60 font-mono">Ctrl</span>
                <span className="bg-white/10 rounded px-1.5 py-0.5 text-[10px] leading-none text-white/60 font-mono">Enter</span>
              </div>
            </div>
          )}

          {/* Start Over */}
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-[11px] leading-none font-medium tracking-wide">Start over</span>
            <div className="flex gap-0.5">
              <span className="bg-white/10 rounded px-1.5 py-0.5 text-[10px] leading-none text-white/60 font-mono">Ctrl</span>
              <span className="bg-white/10 rounded px-1.5 py-0.5 text-[10px] leading-none text-white/60 font-mono">R</span>
            </div>
          </div>

          {/* Question Mark with Tooltip */}
          <div
            className="relative inline-block"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center cursor-help">
              <span className="text-[10px] text-white/60 font-medium">?</span>
            </div>

            {isTooltipVisible && (
              <div
                ref={tooltipRef}
                className="absolute top-full right-0 mt-2 w-72"
                style={{ zIndex: 100 }}
              >
                <div className="p-3 text-xs bg-black/85 backdrop-blur-md rounded-lg border border-white/10 text-white/90 shadow-lg">
                  <div className="space-y-3">
                    <h3 className="font-semibold text-[11px] tracking-wide text-white/95">Keyboard Shortcuts</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-white/70 text-[10px]">Toggle Window</span>
                        <div className="flex gap-0.5">
                          <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] leading-none font-mono">Ctrl</span>
                          <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] leading-none font-mono">B</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/70 text-[10px]">Take Screenshot</span>
                        <div className="flex gap-0.5">
                          <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] leading-none font-mono">Ctrl</span>
                          <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] leading-none font-mono">H</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/70 text-[10px]">Debug</span>
                        <div className="flex gap-0.5">
                          <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] leading-none font-mono">Ctrl</span>
                          <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] leading-none font-mono">Enter</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/70 text-[10px]">Start Over</span>
                        <div className="flex gap-0.5">
                          <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] leading-none font-mono">Ctrl</span>
                          <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] leading-none font-mono">R</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Separator */}
          <div className="h-3.5 w-px bg-white/15" />

          {/* Leave Button */}
          <div
            className="relative"
            onMouseEnter={() => setShowLeaveTooltip(true)}
            onMouseLeave={() => setShowLeaveTooltip(false)}
          >
            <button
              className="text-[11px] leading-none text-red-400/70 hover:text-red-400 transition-colors font-medium"
              onClick={() => window.electronAPI.quitApp()}
            >
              Leave
            </button>
            {showLeaveTooltip && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 pointer-events-none">
                <div className="bg-black/90 backdrop-blur-md text-white/90 text-[10px] leading-relaxed px-3 py-2 rounded-lg border border-white/10 shadow-lg text-center">
                  Don't press this unless you want to close the app, use Ctrl+B instead
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SolutionCommands
