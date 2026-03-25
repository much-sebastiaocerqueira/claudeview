import { memo, useMemo } from "react"
import ReactMarkdown from "react-markdown"
import { markdownComponents, markdownPlugins, preprocessImagePaths } from "./markdown-components"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import type { TokenUsage } from "@/lib/types"
import { shortenModel, formatTokenCount } from "@/lib/format"
import { useDiffFontSize } from "@/contexts/DiffFontSizeContext"

// ── Token usage tooltip ──────────────────────────────────────────────────

function TokenUsageBadge({ usage }: { usage: TokenUsage }): React.ReactElement {
  const totalInput = usage.input_tokens
    + (usage.cache_creation_input_tokens ?? 0)
    + (usage.cache_read_input_tokens ?? 0)
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="text-[10px] text-muted-foreground cursor-default" />}>
          {formatTokenCount(totalInput + usage.output_tokens)} tokens
      </TooltipTrigger>
      <TooltipContent className="text-xs space-y-1">
        <div>Context: {formatTokenCount(totalInput)}</div>
        <div className="pl-2 text-muted-foreground">New: {formatTokenCount(usage.input_tokens)}</div>
        {cacheRead > 0 && (
          <div className="pl-2 text-muted-foreground">
            Cache read: {formatTokenCount(cacheRead)}
          </div>
        )}
        {cacheWrite > 0 && (
          <div className="pl-2 text-muted-foreground">
            Cache write: {formatTokenCount(cacheWrite)}
          </div>
        )}
        <div>Output: {formatTokenCount(usage.output_tokens)}</div>
      </TooltipContent>
    </Tooltip>
  )
}

// ── Main component ───────────────────────────────────────────────────────

interface AssistantTextProps {
  text: string
  model: string | null
  tokenUsage: TokenUsage | null
  timestamp?: string
}

export const AssistantText = memo(function AssistantText({
  text,
  model: _model,
  tokenUsage: _tokenUsage,
  timestamp: _timestamp,
}: AssistantTextProps) {
  const markdownText = useMemo(() => preprocessImagePaths(text), [text])

  const { fontSize } = useDiffFontSize()

  if (!text) return null

  return (
    <div className="rounded-2xl bg-amber-500/[0.06] border border-amber-500/15 px-3.5 py-2.5">
      <div className="break-words overflow-hidden" style={{ fontSize }}>
        <ReactMarkdown components={markdownComponents} remarkPlugins={markdownPlugins}>{markdownText}</ReactMarkdown>
      </div>
    </div>
  )
})
