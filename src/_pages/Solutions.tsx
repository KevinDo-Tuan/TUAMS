// Solutions.tsx
import React, { useState, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "react-query"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism"

import ScreenshotQueue from "../components/Queue/ScreenshotQueue"
import {
  Toast,
  ToastDescription,
  ToastMessage,
  ToastTitle,
  ToastVariant
} from "../components/ui/toast"
import { ProblemStatementData } from "../types/solutions"
import { AudioResult } from "../types/audio"
import SolutionCommands from "../components/Solutions/SolutionCommands"
import Debug from "./Debug"

// (Using global ElectronAPI type from src/types/electron.d.ts)

export const ContentSection = ({
  title,
  content,
  isLoading
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
}) => (
  <div className="space-y-2.5 animate-fade-in">
    <h2 className="text-[13px] font-semibold text-red-200/90 tracking-wide uppercase text-[11px]">
      {title}
    </h2>
    {isLoading ? (
      <div className="mt-4 flex">
        <p className="text-xs bg-gradient-to-r from-red-300/80 via-white to-red-300/80 bg-[length:200%_100%] bg-clip-text text-transparent animate-text-gradient-wave">
          Extracting problem statement...
        </p>
      </div>
    ) : (
      <div className="text-[13px] leading-relaxed text-gray-200/90 max-w-[600px]">
        {content}
      </div>
    )}
  </div>
)
const SolutionSection = ({
  title,
  content,
  isLoading
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
}) => (
  <div className="space-y-2.5 animate-fade-in">
    <h2 className="text-[13px] font-semibold text-red-200/90 tracking-wide uppercase text-[11px]">
      {title}
    </h2>
    {isLoading ? (
      <div className="space-y-1.5">
        <div className="mt-4 flex">
          <p className="text-xs bg-gradient-to-r from-red-300/80 via-white to-red-300/80 bg-[length:200%_100%] bg-clip-text text-transparent animate-text-gradient-wave">
            Loading solutions...
          </p>
        </div>
      </div>
    ) : (
      <div className="w-full code-block-wrapper">
        <SyntaxHighlighter
          showLineNumbers
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
          wrapLongLines={true}
        >
          {content as string}
        </SyntaxHighlighter>
      </div>
    )}
  </div>
)

export const ComplexitySection = ({
  timeComplexity,
  spaceComplexity,
  isLoading
}: {
  timeComplexity: string | null
  spaceComplexity: string | null
  isLoading: boolean
}) => (
  <div className="space-y-2.5 animate-fade-in">
    <h2 className="text-[13px] font-semibold text-red-200/90 tracking-wide uppercase text-[11px]">
      Complexity (Updated)
    </h2>
    {isLoading ? (
      <p className="text-xs bg-gradient-to-r from-red-300/80 via-white to-red-300/80 bg-[length:200%_100%] bg-clip-text text-transparent animate-text-gradient-wave">
        Calculating complexity...
      </p>
    ) : (
      <div className="space-y-2">
        <div className="flex items-center gap-2.5 text-[13px] leading-relaxed text-gray-200/90">
          <div className="complexity-badge">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
            <strong>Time:</strong> {timeComplexity}
          </div>
        </div>
        <div className="flex items-center gap-2.5 text-[13px] leading-relaxed text-gray-200/90">
          <div className="complexity-badge">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
            <strong>Space:</strong> {spaceComplexity}
          </div>
        </div>
      </div>
    )}
  </div>
)

interface SolutionsProps {
  setView: React.Dispatch<React.SetStateAction<"queue" | "solutions" | "debug">>
}
const Solutions: React.FC<SolutionsProps> = ({ setView }) => {
  const queryClient = useQueryClient()
  const contentRef = useRef<HTMLDivElement>(null)

  // Audio recording state
  const [audioRecording, setAudioRecording] = useState(false)
  const [audioResult, setAudioResult] = useState<AudioResult | null>(null)

  const [debugProcessing, setDebugProcessing] = useState(false)
  const [problemStatementData, setProblemStatementData] =
    useState<ProblemStatementData | null>(null)
  const [solutionData, setSolutionData] = useState<string | null>(null)
  const [thoughtsData, setThoughtsData] = useState<string[] | null>(null)
  const [timeComplexityData, setTimeComplexityData] = useState<string | null>(
    null
  )
  const [spaceComplexityData, setSpaceComplexityData] = useState<string | null>(
    null
  )
  const [customContent, setCustomContent] = useState<string | null>(null)

  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<ToastMessage>({
    title: "",
    description: "",
    variant: "neutral"
  })

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)

  const [isResetting, setIsResetting] = useState(false)

  const { data: extraScreenshots = [], refetch } = useQuery<Array<{ path: string; preview: string }>, Error>(
    ["extras"],
    async () => {
      try {
        const existing = await window.electronAPI.getScreenshots()
        return existing
      } catch (error) {
        console.error("Error loading extra screenshots:", error)
        return []
      }
    },
    {
      staleTime: Infinity,
      cacheTime: Infinity
    }
  )

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
    // Height update logic
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

    // Initialize resize observer
    const resizeObserver = new ResizeObserver(updateDimensions)
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current)
    }
    updateDimensions()

    // Set up event listeners
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => {
        // Set resetting state first
        setIsResetting(true)

        // Clear the queries
        queryClient.removeQueries(["solution"])
        queryClient.removeQueries(["new_solution"])

        // Reset other states
        refetch()

        // After a small delay, clear the resetting state
        setTimeout(() => {
          setIsResetting(false)
        }, 0)
      }),
      window.electronAPI.onSolutionStart(async () => {
        // Reset UI state for a new solution
        setSolutionData(null)
        setThoughtsData(null)
        setTimeComplexityData(null)
        setSpaceComplexityData(null)
        setCustomContent(null)
        setAudioResult(null)

        // Start audio recording from user's microphone
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          const mediaRecorder = new MediaRecorder(stream)
          const chunks: Blob[] = []
          mediaRecorder.ondataavailable = (e) => chunks.push(e.data)
          mediaRecorder.start()
          setAudioRecording(true)
          // Record for 5 seconds (or adjust as needed)
          setTimeout(() => mediaRecorder.stop(), 5000)
          mediaRecorder.onstop = async () => {
            setAudioRecording(false)
            const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' })
            const reader = new FileReader()
            reader.onloadend = async () => {
              const base64Data = (reader.result as string).split(',')[1]
              // Send audio to Gemini for analysis
              try {
                const result = await window.electronAPI.analyzeAudioFromBase64(
                  base64Data,
                  blob.type
                )
                // Store result in react-query cache
                queryClient.setQueryData(["audio_result"], result)
                setAudioResult(result)
              } catch (err) {
                console.error('Audio analysis failed:', err)
              }
            }
            reader.readAsDataURL(blob)
          }
        } catch (err) {
          console.error('Audio recording error:', err)
        }

        // Simulate receiving custom content shortly after start
        setTimeout(() => {
          setCustomContent(
            "This is the dynamically generated content appearing after loading starts."
          )
        }, 1500) // Example delay
      }),
      //if there was an error processing the initial solution
      window.electronAPI.onSolutionError((error: string) => {
        showToast(
          "Processing Failed",
          "There was an error processing your extra screenshots.",
          "error"
        )
        // Reset solutions in the cache (even though this shouldn't ever happen) and complexities to previous states
        const solution = queryClient.getQueryData(["solution"]) as {
          code: string
          thoughts: string[]
          time_complexity: string
          space_complexity: string
        } | null
        if (!solution) {
          setView("queue")
        }
        setSolutionData(solution?.code || null)
        setThoughtsData(solution?.thoughts || null)
        setTimeComplexityData(solution?.time_complexity || null)
        setSpaceComplexityData(solution?.space_complexity || null)
        console.error("Processing error:", error)
      }),
      //when the initial solution is generated, we'll set the solution data to that
      window.electronAPI.onSolutionSuccess((data) => {
        if (!data?.solution) {
          console.warn("Received empty or invalid solution data")
          return
        }

        console.log({ solution: data.solution })

        const solutionData = {
          code: data.solution.code,
          thoughts: data.solution.thoughts,
          time_complexity: data.solution.time_complexity,
          space_complexity: data.solution.space_complexity
        }

        queryClient.setQueryData(["solution"], solutionData)
        setSolutionData(solutionData.code || null)
        setThoughtsData(solutionData.thoughts || null)
        setTimeComplexityData(solutionData.time_complexity || null)
        setSpaceComplexityData(solutionData.space_complexity || null)
      }),

      //########################################################
      //DEBUG EVENTS
      //########################################################
      window.electronAPI.onDebugStart(() => {
        setDebugProcessing(true)
      }),
      window.electronAPI.onDebugSuccess((data) => {
        console.log({ debug_data: data })

        queryClient.setQueryData(["new_solution"], data.solution)
        setDebugProcessing(false)
      }),
      window.electronAPI.onDebugError(() => {
        showToast(
          "Processing Failed",
          "There was an error debugging your code.",
          "error"
        )
        setDebugProcessing(false)
      }),
      window.electronAPI.onProcessingNoScreenshots(() => {
        showToast(
          "No Screenshots",
          "There are no extra screenshots to process.",
          "neutral"
        )
      })
    ]

    return () => {
      resizeObserver.disconnect()
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [isTooltipVisible, tooltipHeight])

  useEffect(() => {
    setProblemStatementData(
      queryClient.getQueryData(["problem_statement"]) || null
    )
    setSolutionData(queryClient.getQueryData(["solution"]) || null)

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query.queryKey[0] === "problem_statement") {
        setProblemStatementData(
          queryClient.getQueryData(["problem_statement"]) || null
        )
        const audioResult = queryClient.getQueryData(["audio_result"]) as AudioResult | undefined;
        if (audioResult) {
          setProblemStatementData({
            problem_statement: audioResult.text,
            input_format: {
              description: "Generated from audio input",
              parameters: []
            },
            output_format: {
              description: "Generated from audio input",
              type: "string",
              subtype: "text"
            },
            complexity: {
              time: "N/A",
              space: "N/A"
            },
            test_cases: [],
            validation_type: "manual",
            difficulty: "custom"
          });
          setSolutionData(null);
          setThoughtsData(null);
          setTimeComplexityData(null);
          setSpaceComplexityData(null);
        }
      }
      if (event?.query.queryKey[0] === "solution") {
        const solution = queryClient.getQueryData(["solution"]) as {
          code: string
          thoughts: string[]
          time_complexity: string
          space_complexity: string
        } | null

        setSolutionData(solution?.code ?? null)
        setThoughtsData(solution?.thoughts ?? null)
        setTimeComplexityData(solution?.time_complexity ?? null)
        setSpaceComplexityData(solution?.space_complexity ?? null)
      }
    })
    return () => unsubscribe()
  }, [queryClient])

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  return (
    <>
      {!isResetting && queryClient.getQueryData(["new_solution"]) ? (
        <>
          <Debug
            isProcessing={debugProcessing}
            setIsProcessing={setDebugProcessing}
          />
        </>
      ) : (
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
          {solutionData && (
            <div className="bg-transparent w-fit animate-slide-up">
              <div className="pb-3">
                <div className="space-y-3 w-fit">
                  <ScreenshotQueue
                    isLoading={debugProcessing}
                    screenshots={extraScreenshots}
                    onDeleteScreenshot={handleDeleteExtraScreenshot}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Command bar */}
          <SolutionCommands
            extraScreenshots={extraScreenshots}
            onTooltipVisibilityChange={handleTooltipVisibilityChange}
          />

          {/* Main Content */}
          <div className="w-full text-sm dark-panel">
            <div className="rounded-lg overflow-hidden">
              <div className="px-5 py-4 space-y-5 max-w-full">
                {/* Show Screenshot or Audio Result as main output if validation_type is manual */}
                {problemStatementData?.validation_type === "manual" ? (
                  <ContentSection
                    title={problemStatementData?.output_format?.subtype === "voice" ? "Audio Result" : "Screenshot Result"}
                    content={problemStatementData.problem_statement}
                    isLoading={false}
                  />
                ) : (
                  <>
                    {/* Problem Statement Section */}
                    <ContentSection
                      title={problemStatementData?.output_format?.subtype === "voice" ? "Voice Input" : "Problem Statement"}
                      content={problemStatementData?.problem_statement}
                      isLoading={!problemStatementData}
                    />

                    {/* Loading state */}
                    {problemStatementData && !solutionData && (
                      <div className="mt-4 flex">
                        <p className="text-xs bg-gradient-to-r from-red-300/80 via-white to-red-300/80 bg-[length:200%_100%] bg-clip-text text-transparent animate-text-gradient-wave">
                          {problemStatementData?.output_format?.subtype === "voice"
                            ? "Processing voice input..."
                            : "Generating solutions..."}
                        </p>
                      </div>
                    )}

                    {/* Solution Sections */}
                    {solutionData && (
                      <>
                        <div className="section-divider" />

                        <ContentSection
                          title="Analysis"
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

                        <SolutionSection
                          title={problemStatementData?.output_format?.subtype === "voice" ? "Response" : "Solution"}
                          content={solutionData}
                          isLoading={!solutionData}
                        />
                        {problemStatementData?.output_format?.subtype !== "voice" && (
                          <>
                            <div className="section-divider" />
                            <ComplexitySection
                              timeComplexity={timeComplexityData}
                              spaceComplexity={spaceComplexityData}
                              isLoading={!timeComplexityData || !spaceComplexityData}
                            />
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Solutions
