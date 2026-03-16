// Debug.tsx
import React, { useState, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "react-query"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism"
import { ComplexitySection, ContentSection } from "./Solutions"
import ScreenshotQueue from "../components/Queue/ScreenshotQueue"
import {
  Toast,
  ToastDescription,
  ToastMessage,
  ToastTitle,
  ToastVariant
} from "../components/ui/toast"
import ExtraScreenshotsQueueHelper from "../components/Solutions/SolutionCommands"
import { diffLines } from "diff"

type DiffLine = {
  value: string
  added?: boolean
  removed?: boolean
}

const syntaxHighlighterStyles = {
  ".syntax-line": {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "break-word"
  }
} as const

const CodeComparisonSection = ({
  oldCode,
  newCode,
  isLoading
}: {
  oldCode: string | null
  newCode: string | null
  isLoading: boolean
}) => {
  const computeDiff = () => {
    if (!oldCode || !newCode) return { leftLines: [], rightLines: [] }

    // Normalize line endings and clean up the code
    const normalizeCode = (code: string) => {
      return code
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim()
    }

    const normalizedOldCode = normalizeCode(oldCode)
    const normalizedNewCode = normalizeCode(newCode)

    const diff = diffLines(normalizedOldCode, normalizedNewCode, {
      newlineIsToken: true,
      ignoreWhitespace: true
    })

    const leftLines: DiffLine[] = []
    const rightLines: DiffLine[] = []

    diff.forEach((part) => {
      if (part.added) {
        leftLines.push(...Array(part.count || 0).fill({ value: "" }))
        rightLines.push(
          ...part.value
            .split("\n")
            .filter((line) => line.length > 0)
            .map((line) => ({
              value: line,
              added: true
            }))
        )
      } else if (part.removed) {
        leftLines.push(
          ...part.value
            .split("\n")
            .filter((line) => line.length > 0)
            .map((line) => ({
              value: line,
              removed: true
            }))
        )
        rightLines.push(...Array(part.count || 0).fill({ value: "" }))
      } else {
        const lines = part.value.split("\n").filter((line) => line.length > 0)
        leftLines.push(...lines.map((line) => ({ value: line })))
        rightLines.push(...lines.map((line) => ({ value: line })))
      }
    })

    return { leftLines, rightLines }
  }

  const { leftLines, rightLines } = computeDiff()

  return (
    <div className="space-y-2.5 animate-fade-in">
      <h2 className="text-[13px] font-semibold text-red-200/90 tracking-wide uppercase text-[11px]">
        Code Comparison
      </h2>
      {isLoading ? (
        <div className="space-y-1">
          <div className="mt-3 flex">
            <p className="text-xs bg-gradient-to-r from-red-300/80 via-white to-red-300/80 bg-[length:200%_100%] bg-clip-text text-transparent animate-text-gradient-wave">
              Loading code comparison...
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-row gap-px code-block-wrapper">
          {/* Previous Code */}
          <div className="w-1/2 border-r border-red-900/20">
            <div className="bg-red-950/40 px-3 py-2 border-b border-red-900/20">
              <h3 className="text-[11px] font-medium text-red-200/70">
                Previous Version
              </h3>
            </div>
            <div className="overflow-x-auto">
              <SyntaxHighlighter
                language="python"
                style={dracula}
                customStyle={{
                  maxWidth: "100%",
                  margin: 0,
                  padding: "1rem",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  background: "hsla(220, 40%, 6%, 0.7)",
                  borderRadius: 0
                }}
                wrapLines={true}
                showLineNumbers={true}
                lineProps={(lineNumber) => {
                  const line = leftLines[lineNumber - 1]
                  return {
                    style: {
                      display: "block",
                      backgroundColor: line?.removed
                        ? "rgba(220, 38, 38, 0.12)"
                        : "transparent"
                    }
                  }
                }}
              >
                {leftLines.map((line) => line.value).join("\n")}
              </SyntaxHighlighter>
            </div>
          </div>

          {/* New Code */}
          <div className="w-1/2">
            <div className="bg-red-950/40 px-3 py-2 border-b border-red-900/20">
              <h3 className="text-[11px] font-medium text-red-200/70">
                New Version
              </h3>
            </div>
            <div className="overflow-x-auto">
              <SyntaxHighlighter
                language="python"
                style={dracula}
                customStyle={{
                  maxWidth: "100%",
                  margin: 0,
                  padding: "1rem",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  background: "hsla(220, 40%, 6%, 0.7)",
                  borderRadius: 0
                }}
                wrapLines={true}
                showLineNumbers={true}
                lineProps={(lineNumber) => {
                  const line = rightLines[lineNumber - 1]
                  return {
                    style: {
                      display: "block",
                      backgroundColor: line?.added
                        ? "rgba(34, 197, 94, 0.12)"
                        : "transparent"
                    }
                  }
                }}
              >
                {rightLines.map((line) => line.value).join("\n")}
              </SyntaxHighlighter>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface DebugProps {
  isProcessing: boolean
  setIsProcessing: (isProcessing: boolean) => void
}

const Debug: React.FC<DebugProps> = ({ isProcessing, setIsProcessing }) => {
  const queryClient = useQueryClient()
  const contentRef = useRef<HTMLDivElement>(null)

  const [oldCode, setOldCode] = useState<string | null>(null)
  const [newCode, setNewCode] = useState<string | null>(null)
  const [thoughtsData, setThoughtsData] = useState<string[] | null>(null)
  const [timeComplexityData, setTimeComplexityData] = useState<string | null>(
    null
  )
  const [spaceComplexityData, setSpaceComplexityData] = useState<string | null>(
    null
  )

  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<ToastMessage>({
    title: "",
    description: "",
    variant: "neutral"
  })

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)

  const { data: extraScreenshots = [], refetch } = useQuery({
    queryKey: ["extras"],
    queryFn: async () => {
      try {
        const existing = await window.electronAPI.getScreenshots()
        return existing
      } catch (error) {
        console.error("Error loading extra screenshots:", error)
        return []
      }
    },
    staleTime: Infinity,
    cacheTime: Infinity
  })

  const showToast = (
    title: string,
    description: string,
    variant: ToastVariant
  ) => {
    setToastMessage({ title, description, variant })
    setToastOpen(true)
  }

  const handleDeleteExtraScreenshot = async (index: number) => {
    const screenshotToDelete = extraScreenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        refetch()
      } else {
        console.error("Failed to delete extra screenshot:", response.error)
      }
    } catch (error) {
      console.error("Error deleting extra screenshot:", error)
    }
  }

  useEffect(() => {
    // Try to get the new solution data from cache first
    const newSolution = queryClient.getQueryData(["new_solution"]) as {
      old_code: string
      new_code: string
      thoughts: string[]
      time_complexity: string
      space_complexity: string
    } | null

    if (newSolution) {
      setOldCode(newSolution.old_code || null)
      setNewCode(newSolution.new_code || null)
      setThoughtsData(newSolution.thoughts || null)
      setTimeComplexityData(newSolution.time_complexity || null)
      setSpaceComplexityData(newSolution.space_complexity || null)
      setIsProcessing(false)
    }

    // Set up event listeners
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => refetch()),
      window.electronAPI.onDebugSuccess(() => {
        setIsProcessing(false)
      }),
      window.electronAPI.onDebugStart(() => {
        setIsProcessing(true)
      }),
      window.electronAPI.onDebugError((error: string) => {
        showToast(
          "Processing Failed",
          "There was an error debugging your code.",
          "error"
        )
        setIsProcessing(false)
        console.error("Processing error:", error)
      })
    ]

    // Set up resize observer
    const updateDimensions = () => {
      if (contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight
        const contentWidth = contentRef.current.scrollWidth
        if (isTooltipVisible) {
          contentHeight += tooltipHeight
        }
        window.electronAPI.updateContentDimensions({
          width: contentWidth,
          height: contentHeight
        })
      }
    }

    const resizeObserver = new ResizeObserver(updateDimensions)
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current)
    }
    updateDimensions()

    return () => {
      resizeObserver.disconnect()
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [queryClient])

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  return (
    <div ref={contentRef} className="relative space-y-3 px-4 py-3 animate-fade-in">
      <Toast
        open={toastOpen}
        onOpenChange={setToastOpen}
        variant={toastMessage.variant}
        duration={3000}
      >
        <ToastTitle>{toastMessage.title}</ToastTitle>
        <ToastDescription>{toastMessage.description}</ToastDescription>
      </Toast>

      {/* Screenshot queue */}
      <div className="bg-transparent w-fit">
        <div className="pb-3">
          <div className="space-y-3 w-fit">
            <ScreenshotQueue
              screenshots={extraScreenshots}
              onDeleteScreenshot={handleDeleteExtraScreenshot}
              isLoading={isProcessing}
            />
          </div>
        </div>
      </div>

      {/* Command bar */}
      <ExtraScreenshotsQueueHelper
        extraScreenshots={extraScreenshots}
        onTooltipVisibilityChange={handleTooltipVisibilityChange}
      />

      {/* Main Content */}
      <div className="w-full text-sm dark-panel">
        <div className="rounded-lg overflow-hidden">
          <div className="px-5 py-4 space-y-5">
            {/* Thoughts Section */}
            <ContentSection
              title="What I Changed"
              content={
                thoughtsData && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      {thoughtsData.map((thought, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-2.5 animate-fade-in"
                          style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'both' }}
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-red-400/70 mt-1.5 shrink-0" />
                          <div>{thought}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }
              isLoading={!thoughtsData}
            />

            <div className="section-divider" />

            {/* Code Comparison Section */}
            <CodeComparisonSection
              oldCode={oldCode}
              newCode={newCode}
              isLoading={!oldCode || !newCode}
            />

            <div className="section-divider" />

            {/* Complexity Section */}
            <ComplexitySection
              timeComplexity={timeComplexityData}
              spaceComplexity={spaceComplexityData}
              isLoading={!timeComplexityData || !spaceComplexityData}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Debug
