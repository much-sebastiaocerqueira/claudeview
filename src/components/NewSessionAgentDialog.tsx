import { Bot, Code2, type LucideIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { shortPath } from "@/lib/format"
import type { AgentKind } from "@/lib/sessionSource"

interface NewSessionAgentDialogProps {
  open: boolean
  cwd: string | null
  onClose: () => void
  onSelect: (agentKind: AgentKind) => void
}

interface AgentOption {
  kind: AgentKind
  title: string
  description: string
  icon: LucideIcon
  iconClassName: string
}

const AGENT_OPTIONS: AgentOption[] = [
  {
    kind: "claude",
    title: "Claude Code",
    description: "Worktrees and MCP tools stay available.",
    icon: Bot,
    iconClassName: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  },
  {
    kind: "codex",
    title: "Codex",
    description: "Starts a Codex session in this directory.",
    icon: Code2,
    iconClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
]

export function NewSessionAgentDialog({
  open,
  cwd,
  onClose,
  onSelect,
}: NewSessionAgentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-2xl overflow-hidden border-border/50 bg-elevation-1 p-0">
        <div className="border-b border-border/40 bg-elevation-2/80 px-6 py-6 sm:px-7">
          <DialogHeader className="gap-4 text-left">
            <div className="space-y-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground/70">
                New Session
              </span>
              <DialogTitle className="text-3xl font-semibold tracking-tight sm:text-[2rem]">
                Choose Your Agent
              </DialogTitle>
              <DialogDescription className="text-sm leading-6 text-muted-foreground">
                Pick the agent for this project.
              </DialogDescription>
            </div>
            {cwd && (
              <div className="inline-flex max-w-full items-center rounded-full border border-border/50 bg-elevation-1 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                {shortPath(cwd)}
              </div>
            )}
          </DialogHeader>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          {AGENT_OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <button
                key={option.kind}
                type="button"
                onClick={() => onSelect(option.kind)}
                className="group flex min-h-[168px] flex-col rounded-[18px] border border-border/50 bg-elevation-0 p-5 text-left transition-all duration-150 hover:border-border hover:bg-elevation-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "inline-flex size-11 items-center justify-center rounded-2xl border",
                      option.iconClassName,
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                </div>

                <div className="mt-6 space-y-2">
                  <h3 className="text-xl font-semibold tracking-tight text-foreground">
                    {option.title}
                  </h3>
                  <p className="max-w-xs text-sm leading-6 text-muted-foreground">
                    {option.description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
