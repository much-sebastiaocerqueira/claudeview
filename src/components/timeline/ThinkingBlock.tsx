import { useState, memo } from "react"
import { ChevronRight, ChevronDown } from "lucide-react"
import type { ThinkingBlock as ThinkingBlockType } from "@/lib/types"

interface ThinkingBlockProps {
  blocks: ThinkingBlockType[]
  expandAll: boolean
}

export const ThinkingBlock = memo(function ThinkingBlock({ blocks, expandAll }: ThinkingBlockProps) {
  const [open, setOpen] = useState(false)
  const isOpen = expandAll || open

  if (blocks.length === 0) return null

  // Check if any blocks have visible thinking content (non-redacted)
  const visibleBlocks = blocks.filter((b) => b.thinking)
  const allRedacted = visibleBlocks.length === 0

  // All thinking is redacted — show a compact indicator (not expandable)
  if (allRedacted) {
    return (
      <div className="flex items-center gap-1.5 py-0.5">
        <span className="text-[10px] text-violet-400/50 italic">
          Thinking... ({blocks.length} block{blocks.length > 1 ? "s" : ""})
        </span>
      </div>
    )
  }

  if (isOpen) {
    return (
      <div className="space-y-2">
        {!expandAll && (
          <button
            onClick={() => setOpen(false)}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className="size-3" />
            <span>Thinking... ({visibleBlocks.length} block{visibleBlocks.length > 1 ? "s" : ""})</span>
          </button>
        )}
        {visibleBlocks.map((block, i) => (
          <pre
            key={i}
            className="text-xs text-muted-foreground/70 font-mono whitespace-pre-wrap break-words max-h-96 overflow-y-auto"
          >
            {block.thinking}
          </pre>
        ))}
      </div>
    )
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className="flex items-center gap-2 w-full py-1 text-left transition-colors hover:opacity-80"
    >
      <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs text-muted-foreground shrink-0">
        Thinking... ({visibleBlocks.length} block{visibleBlocks.length > 1 ? "s" : ""})
      </span>
    </button>
  )
})
