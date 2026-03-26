import { memo, useState, useCallback } from "react"
import {
  Bot, Terminal, ChevronDown, ChevronUp, Clock, Wrench,
  CheckCircle2, Loader2, Navigation, XCircle, TerminalSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDuration } from "@/lib/format"
import { useBackgroundProcesses, type BackgroundProcessSummary } from "@/hooks/useBackgroundAgentSummary"
import { useSessionContext } from "@/contexts/SessionContext"
import { useAppContext } from "@/contexts/AppContext"

function StatusIcon({ status }: { status: BackgroundProcessSummary["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="size-3.5 text-violet-400 animate-spin" />
    case "completed":
      return <CheckCircle2 className="size-3.5 text-green-400" />
    case "error":
      return <XCircle className="size-3.5 text-red-400" />
  }
}

function KindIcon({ kind }: { kind: BackgroundProcessSummary["kind"] }) {
  return kind === "agent"
    ? <Bot className="size-3 text-violet-400 shrink-0" />
    : <Terminal className="size-3 text-amber-400 shrink-0" />
}

interface BackgroundAgentTrackerProps {
  /** Opens a background process output in the ProcessPanel */
  onViewOutput?: (id: string, outputPath: string, title: string) => void
}

/**
 * Floating tracker widget that shows all background processes in the session.
 * Covers both Agent/Task and Bash tool calls with run_in_background: true.
 */
export const BackgroundAgentTracker = memo(function BackgroundAgentTracker({
  onViewOutput,
}: BackgroundAgentTrackerProps) {
  const { session } = useSessionContext()
  const { dispatch } = useAppContext()
  const processes = useBackgroundProcesses(session)
  const [expanded, setExpanded] = useState(false)

  const handleJump = useCallback((turnIndex: number) => {
    dispatch({ type: "JUMP_TO_TURN", index: turnIndex })
  }, [dispatch])

  if (processes.length === 0) return null

  const runningCount = processes.filter((p) => p.status === "running").length
  const totalCount = processes.length

  return (
    <div className={cn(
      "absolute bottom-14 right-4 z-30 rounded-lg border elevation-3 depth-high",
      "transition-all duration-200",
      runningCount > 0
        ? "border-violet-500/40 bg-violet-950/80 backdrop-blur-sm"
        : "border-border/60 bg-elevation-2/90 backdrop-blur-sm",
      expanded ? "w-72" : "w-auto",
    )}>
      {/* Collapsed pill / header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:opacity-90 transition-opacity"
      >
        {runningCount > 0
          ? <Loader2 className="size-3.5 shrink-0 animate-spin text-violet-400" />
          : <CheckCircle2 className="size-3.5 shrink-0 text-green-400" />}
        <span className={cn("text-xs font-medium", runningCount > 0 ? "text-violet-300" : "text-muted-foreground")}>
          {runningCount > 0
            ? `${runningCount} background process${runningCount !== 1 ? "es" : ""} running`
            : `${totalCount} background process${totalCount !== 1 ? "es" : ""} done`}
        </span>
        {runningCount > 0 && (
          <span className="relative flex size-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-violet-400" />
          </span>
        )}
        {expanded
          ? <ChevronDown className="size-3 text-muted-foreground ml-auto shrink-0" />
          : <ChevronUp className="size-3 text-muted-foreground ml-auto shrink-0" />}
      </button>

      {/* Expanded list */}
      {expanded && (
        <div className="border-t border-border/40 max-h-64 overflow-y-auto">
          {processes.map((proc) => (
            <div
              key={proc.id}
              className="flex items-start gap-2 px-3 py-2 border-b border-border/20 last:border-b-0"
            >
              <div className="mt-0.5 shrink-0">
                <StatusIcon status={proc.status} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <KindIcon kind={proc.kind} />
                  <span className="text-[11px] font-medium text-foreground truncate">
                    {proc.label}
                  </span>
                </div>
                {proc.description && (
                  <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5 leading-snug font-mono">
                    {proc.description}
                  </p>
                )}
                {(proc.durationMs != null || (proc.toolUseCount != null && proc.toolUseCount > 0)) && (
                  <div className="flex items-center gap-2 mt-1">
                    {proc.durationMs != null && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/50">
                        <Clock className="size-2.5" />
                        {formatDuration(proc.durationMs)}
                      </span>
                    )}
                    {proc.toolUseCount != null && proc.toolUseCount > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/50">
                        <Wrench className="size-2.5" />
                        {proc.toolUseCount}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* View output button (Bash processes with output file) */}
              {proc.outputPath && onViewOutput && (
                <button
                  onClick={() => onViewOutput(proc.id, proc.outputPath!, proc.label)}
                  className="mt-0.5 shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
                  title="View output"
                >
                  <TerminalSquare className="size-3 text-muted-foreground/60" />
                </button>
              )}

              {/* Jump to turn */}
              <button
                onClick={() => handleJump(proc.turnIndex)}
                className="mt-0.5 shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
                title={`Jump to turn ${proc.turnIndex + 1}`}
              >
                <Navigation className="size-3 text-muted-foreground/60" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
