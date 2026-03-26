import { useEffect, useCallback, useState } from "react"
import ReactMarkdown from "react-markdown"
import { X, ChevronLeft, ChevronRight, Eye, Code } from "lucide-react"
import { cn } from "@/lib/utils"
import { FullDiffView } from "./FullDiffView"
import { markdownComponents, markdownPlugins, preprocessImagePaths } from "@/components/timeline/markdown-components"

/**
 * Shorten an absolute file path to a project-relative display path.
 * Strips common prefixes (home dir, dev dirs, client project structure)
 * and falls back to the last 4 path segments if nothing matched.
 */
function shortenPath(filePath: string): string {
  const segments = filePath.split("/")
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === "dev" && i + 2 < segments.length) {
      const next = segments[i + 1]
      // dev/client_projects/Client/project/module/... → module/...
      if (next === "client_projects" && i + 4 < segments.length) {
        return segments.slice(i + 4).join("/")
      }
      // dev/internal/project/module/... → module/...
      if (next === "internal" && i + 3 < segments.length) {
        return segments.slice(i + 3).join("/")
      }
      // dev/project/src/... → src/...
      return segments.slice(i + 2).join("/")
    }
  }
  if (segments.length > 4) return segments.slice(-4).join("/")
  return filePath
}

export interface DiffViewModalProps {
  oldContent: string
  newContent: string
  filePath: string
  additions?: number
  deletions?: number
  onClose: () => void
  /** Navigate to the previous file in the list. */
  onPrev?: () => void
  /** Navigate to the next file in the list. */
  onNext?: () => void
  hasPrev?: boolean
  hasNext?: boolean
}

function isMarkdownFile(path: string): boolean {
  const lower = path.toLowerCase()
  return lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".markdown")
}

export function DiffViewModal({
  oldContent,
  newContent,
  filePath,
  additions,
  deletions,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
}: DiffViewModalProps) {
  const [mode, setMode] = useState<"split" | "unified">(oldContent ? "split" : "unified")
  const [preview, setPreview] = useState(false)

  // Reset mode and preview when navigating to a different file
  useEffect(() => {
    setMode(oldContent ? "split" : "unified")
    setPreview(false)
  }, [filePath, oldContent])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft" && hasPrev) onPrev?.()
      if (e.key === "ArrowRight" && hasNext) onNext?.()
    },
    [onClose, onPrev, onNext, hasPrev, hasNext],
  )

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = ""
    }
  }, [handleKeyDown])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3 min-w-0">
          {/* Prev / Next navigation */}
          {(onPrev || onNext) && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={onPrev}
                disabled={!hasPrev}
                className={cn(
                  "p-1 rounded hover:bg-accent transition-colors",
                  !hasPrev && "opacity-25 cursor-default",
                )}
                aria-label="Previous file"
                title="Previous file (←)"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                onClick={onNext}
                disabled={!hasNext}
                className={cn(
                  "p-1 rounded hover:bg-accent transition-colors",
                  !hasNext && "opacity-25 cursor-default",
                )}
                aria-label="Next file"
                title="Next file (→)"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
          <span className="font-mono text-sm truncate" title={filePath}>{shortenPath(filePath)}</span>
          {(additions !== undefined || deletions !== undefined) && (
            <span className="text-xs text-muted-foreground shrink-0">
              {additions !== undefined && <span className="text-green-500">+{additions}</span>}
              {deletions !== undefined && (
                <span className="text-red-500 ml-1">-{deletions}</span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isMarkdownFile(filePath) && (
            <button
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs rounded border hover:bg-accent transition-colors",
                preview && "bg-accent border-accent-foreground/20",
              )}
              onClick={() => setPreview(!preview)}
              title={preview ? "Show diff" : "Preview markdown"}
            >
              {preview ? <Code className="size-3" /> : <Eye className="size-3" />}
              {preview ? "Diff" : "Preview"}
            </button>
          )}
          {!preview && (
            <button
              className="px-2 py-1 text-xs rounded border hover:bg-accent"
              onClick={() => setMode(mode === "split" ? "unified" : "split")}
            >
              {mode === "split" ? "Unified" : "Split"}
            </button>
          )}
          <button
            className="p-1 rounded hover:bg-accent"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {preview ? (
          <div className="max-w-4xl mx-auto px-8 py-6 prose-sm">
            <ReactMarkdown
              components={markdownComponents}
              remarkPlugins={markdownPlugins}
            >
              {preprocessImagePaths(newContent)}
            </ReactMarkdown>
          </div>
        ) : (
          <FullDiffView
            oldContent={oldContent}
            newContent={newContent}
            filePath={filePath}
            mode={mode}
          />
        )}
      </div>
    </div>
  )
}
