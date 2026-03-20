import { useState, useCallback, useMemo, memo } from "react"
import {
  User,
  Pencil,
  FilePlus,
  Terminal,
  Eye,
  Users,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAppContext } from "@/contexts/AppContext"
import { useSessionContext } from "@/contexts/SessionContext"
import type { Turn, ToolCall } from "@/lib/types"

// ── Tool icon mapping ──────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, typeof Pencil> = {
  Edit: Pencil,
  Write: FilePlus,
  Bash: Terminal,
  Read: Eye,
  Agent: Users,
  Task: Users,
}

function getToolIcon(name: string) {
  return TOOL_ICONS[name] ?? Terminal
}

// ── Duration formatting ────────────────────────────────────────────────────

function formatDuration(ms: number | null): string {
  if (ms === null) return ""
  if (ms < 1000) return `${ms}ms`
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  return `${mins}m${remSecs > 0 ? ` ${remSecs}s` : ""}`
}

function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp)
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  } catch {
    return ""
  }
}

// ── Tool call sub-node ─────────────────────────────────────────────────────

const ToolCallNode = memo(function ToolCallNode({ tc }: { tc: ToolCall }) {
  const Icon = getToolIcon(tc.name)
  const filePath = (tc.input.file_path ?? tc.input.path ?? tc.input.command) as string | undefined
  const shortLabel = filePath
    ? filePath.split("/").pop()?.slice(0, 30) ?? tc.name
    : tc.name

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 pl-6 py-0.5 text-[10px] font-mono",
        tc.isError ? "text-red-400" : "text-muted-foreground/70",
      )}
    >
      <Icon className="size-2.5 shrink-0" />
      <span className="truncate">{shortLabel}</span>
      {tc.isError && <AlertCircle className="size-2.5 text-red-400 shrink-0" />}
    </div>
  )
})

// ── Turn node ──────────────────────────────────────────────────────────────

interface TurnNodeProps {
  turn: Turn
  index: number
  isActive: boolean
  onClick: (index: number) => void
}

const TurnNode = memo(function TurnNode({ turn, index, isActive, onClick }: TurnNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const toolCalls = turn.toolCalls
  const hasTools = toolCalls.length > 0
  const hasErrors = toolCalls.some((tc) => tc.isError)
  const subAgentCount = turn.subAgentActivity.length

  const userPreview = useMemo(() => {
    if (!turn.userMessage) return null
    const blocks = Array.isArray(turn.userMessage) ? turn.userMessage : []
    for (const block of blocks) {
      if (typeof block === "string") return block.slice(0, 60)
      if (typeof block === "object" && block !== null && "text" in block) {
        return (block as { text: string }).text.slice(0, 60)
      }
    }
    return null
  }, [turn.userMessage])

  return (
    <div className="relative">
      {/* Vertical connector line */}
      <div className="absolute left-[9px] top-0 bottom-0 w-px bg-border/40" />

      {/* Turn header */}
      <button
        className={cn(
          "flex items-start gap-2 w-full px-1.5 py-1 rounded text-left transition-colors relative",
          isActive
            ? "bg-blue-500/10 text-blue-400"
            : "hover:bg-elevation-2/50 text-foreground",
        )}
        onClick={() => onClick(index)}
      >
        {/* Turn dot */}
        <div
          className={cn(
            "size-[18px] shrink-0 rounded-full flex items-center justify-center z-10",
            isActive
              ? "bg-blue-500 text-white"
              : hasErrors
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "bg-elevation-2 text-muted-foreground border border-border/50",
          )}
        >
          <User className="size-2.5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium">
              Turn {index + 1}
            </span>
            {turn.durationMs !== null && (
              <span className="text-[9px] text-muted-foreground/50 flex items-center gap-0.5">
                <Clock className="size-2" />
                {formatDuration(turn.durationMs)}
              </span>
            )}
            {hasTools && (
              <button
                className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  setExpanded(!expanded)
                }}
              >
                {expanded ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronRight className="size-3" />
                )}
              </button>
            )}
          </div>
          {userPreview && (
            <p className="text-[9px] text-muted-foreground/60 truncate mt-0.5">
              {userPreview}
            </p>
          )}
          {!expanded && hasTools && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[9px] text-muted-foreground/40">
                {toolCalls.length} tool{toolCalls.length !== 1 ? "s" : ""}
              </span>
              {subAgentCount > 0 && (
                <span className="text-[9px] text-indigo-400/60">
                  {subAgentCount} agent{subAgentCount !== 1 ? "s" : ""}
                </span>
              )}
              {hasErrors && (
                <AlertCircle className="size-2.5 text-red-400" />
              )}
            </div>
          )}
        </div>

        <span className="text-[8px] text-muted-foreground/40 tabular-nums shrink-0 mt-0.5">
          {formatTime(turn.timestamp)}
        </span>
      </button>

      {/* Expanded tool calls */}
      {expanded && hasTools && (
        <div className="pb-0.5">
          {toolCalls.map((tc) => (
            <ToolCallNode key={tc.id} tc={tc} />
          ))}
          {subAgentCount > 0 && (
            <div className="flex items-center gap-1.5 pl-6 py-0.5 text-[10px] text-indigo-400/60">
              <Users className="size-2.5" />
              <span>{subAgentCount} sub-agent{subAgentCount !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

// ── Duration gap badge ─────────────────────────────────────────────────────

function DurationGap({ fromTimestamp, toTimestamp }: { fromTimestamp: string; toTimestamp: string }) {
  const gapMs = new Date(toTimestamp).getTime() - new Date(fromTimestamp).getTime()
  if (gapMs < 5000) return null // Don't show gaps < 5s
  return (
    <div className="flex items-center gap-1 pl-2.5 py-0.5">
      <div className="w-px h-2 bg-border/20" />
      <span className="text-[8px] text-muted-foreground/30 tabular-nums">
        +{formatDuration(gapMs)}
      </span>
    </div>
  )
}

// ── Main timeline component ────────────────────────────────────────────────

export const SessionTimeline = memo(function SessionTimeline() {
  const { state, dispatch } = useAppContext()
  const { session } = useSessionContext()

  const turns = session?.turns ?? []
  const activeTurnIndex = state.activeTurnIndex

  const handleTurnClick = useCallback(
    (index: number) => {
      dispatch({ type: "JUMP_TO_TURN", index })
    },
    [dispatch],
  )

  if (turns.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[11px] text-muted-foreground/50">
        No turns yet
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-1 py-2 space-y-0.5">
      {turns.map((turn, i) => (
        <div key={turn.id || i}>
          {i > 0 && turns[i - 1].timestamp && turn.timestamp && (
            <DurationGap
              fromTimestamp={turns[i - 1].timestamp}
              toTimestamp={turn.timestamp}
            />
          )}
          <TurnNode
            turn={turn}
            index={i}
            isActive={activeTurnIndex === i}
            onClick={handleTurnClick}
          />
        </div>
      ))}
    </div>
  )
})
