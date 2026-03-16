import React from "react"
import { X } from "lucide-react"

interface Screenshot {
  path: string
  preview: string
}

interface ScreenshotItemProps {
  screenshot: Screenshot
  onDelete: (index: number) => void
  index: number
  isLoading: boolean
}

const ScreenshotItem: React.FC<ScreenshotItemProps> = ({
  screenshot,
  onDelete,
  index,
  isLoading
}) => {
  const handleDelete = async () => {
    await onDelete(index)
  }

  return (
    <div
      className={`screenshot-card relative animate-scale-in ${isLoading ? "" : "group"}`}
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
    >
      <div className="w-full h-full relative overflow-hidden rounded-[calc(0.75rem-1.5px)]">
        {isLoading && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-red-300 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <img
          src={screenshot.preview}
          alt="Screenshot"
          className={`w-full h-full object-cover transition-all duration-400 ease-smooth ${
            isLoading
              ? "opacity-50 scale-100"
              : "cursor-pointer group-hover:scale-[1.06] group-hover:brightness-[0.7]"
          }`}
        />
      </div>
      {!isLoading && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleDelete()
          }}
          className="absolute top-1.5 left-1.5 p-1 rounded-lg bg-black/50 backdrop-blur-sm text-white opacity-0 group-hover:opacity-100 transition-all duration-250 hover:bg-[hsla(0,72%,51%,0.8)] hover:scale-110 border border-white/10"
          aria-label="Delete screenshot"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}

export default ScreenshotItem
